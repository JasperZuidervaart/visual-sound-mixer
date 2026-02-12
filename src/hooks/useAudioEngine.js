import { useRef, useCallback, useEffect } from 'react';

const audioCtxRef = { current: null };

function getAudioContext() {
  if (!audioCtxRef.current) {
    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    // Expose globally for beat clock access
    window.__audioCtx = audioCtxRef.current;
  }
  return audioCtxRef.current;
}

export function resumeAudioContext() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

// Compute loudness compensation gain for filter position.
function getFilterCompensation(y) {
  if (y >= 0.4 && y <= 0.6) return 1.0;
  if (y < 0.4) {
    const t = 1 - (y / 0.4);
    return 1.0 - t * 0.15;
  } else {
    const t = (y - 0.6) / 0.4;
    return 1.0 + t * t * 0.8;
  }
}

// Master analyser for metering — singleton attached to destination
const masterAnalyserRef = { current: null };

export function getMasterAnalyser() {
  if (!masterAnalyserRef.current) {
    const ctx = getAudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    masterAnalyserRef.current = analyser;
  }
  return masterAnalyserRef.current;
}

// ===== Reverb: shared convolver with synthesized IR =====
// Hall/room reverb, 1.5s decay, with HPF 12dB/oct at 5kHz on the wet signal

const reverbRef = { current: null };

function getReverbSend() {
  if (reverbRef.current) return reverbRef.current;

  const ctx = getAudioContext();
  const masterAnalyser = getMasterAnalyser();

  // Create reverb IR: stereo, 1.5s, exponential decay with noise
  const sampleRate = ctx.sampleRate;
  const duration = 1.5;
  const length = Math.ceil(sampleRate * duration);
  const irBuffer = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = irBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Exponential decay envelope (RT60 = 1.5s → decay rate = -60dB/1.5s)
      const envelope = Math.exp(-t * (6.908 / duration)); // ln(1000)/duration for -60dB
      // White noise * envelope, with some diffusion from random phase
      // Scale up IR to compensate for energy loss in convolution
      data[i] = (Math.random() * 2 - 1) * envelope * 3.0;
    }
  }

  // Convolver
  const convolver = ctx.createConvolver();
  convolver.buffer = irBuffer;

  // Reverb wet gain (controlled per-update based on reverbEnabled)
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0; // starts silent, controlled by updateReverbSend

  // Signal flow: input → convolver → wetGain → masterAnalyser → destination
  // Per-orb LPF filtering happens before the shared reverb input (in startSound)
  const inputNode = ctx.createGain();
  inputNode.gain.value = 1;

  inputNode.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(masterAnalyser);
  masterAnalyser.connect(ctx.destination);

  reverbRef.current = { inputNode, wetGain, convolver };
  console.log('[Reverb] Chain created — IR duration:', duration, 's, sampleRate:', sampleRate, '(per-orb LPF on send)');
  return reverbRef.current;
}

// Update the global reverb send level
export function updateReverbGlobalGain(enabled, sendLevel) {
  // Ensure reverb chain exists when enabling
  if (enabled) getReverbSend();
  if (!reverbRef.current) return;
  const ctx = getAudioContext();
  const val = enabled ? sendLevel : 0;
  console.log('[Reverb] Send level update — enabled:', enabled, 'sendLevel:', sendLevel, '→ val:', val);
  reverbRef.current.wetGain.gain.setTargetAtTime(val, ctx.currentTime, 0.05);
}

export function useAudioEngine() {
  const nodesRef = useRef(new Map());

  // startAt: optional AudioContext time for quantized start (null = immediate)
  // filterEnabled: whether HPF/LPF filter is active (false = passthrough)
  const startSound = useCallback((orbId, audioBuffer, x, y, size, muted, startAt = null, filterEnabled = true, reverbLpfFreq = 3500) => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    // Stop existing if any
    stopSound(orbId);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    // Connect dry path: source → filter → gain → panner → analyser → masterAnalyser → destination
    const masterAnalyser = getMasterAnalyser();
    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(analyser);
    analyser.connect(masterAnalyser);
    masterAnalyser.connect(ctx.destination);

    // Connect reverb send: filter → reverbSendLPF → shared reverb input
    // Send is after filter but before gain — reverb level is independent of orb volume
    // Per-orb LPF on reverb send: 3.5kHz default, tracks HPF when HPF > 3.5kHz
    const reverbSendLPF = ctx.createBiquadFilter();
    reverbSendLPF.type = 'lowpass';
    reverbSendLPF.frequency.value = reverbLpfFreq;
    reverbSendLPF.Q.value = 0.707;

    const reverb = getReverbSend();
    filter.connect(reverbSendLPF);
    reverbSendLPF.connect(reverb.inputNode);

    // Set initial reverb send LPF based on y position
    updateReverbSendLPF(reverbSendLPF, y, ctx, filterEnabled, reverbLpfFreq);

    // Volume + panning + filter
    const t = Math.max(0, Math.min(1, size / 200));
    const baseVolume = t * t * t;
    const compensation = filterEnabled ? getFilterCompensation(y) : 1.0;
    const finalVolume = muted ? 0 : Math.min(1.5, baseVolume * compensation);

    const panValue = (x * 2) - 1;
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), ctx.currentTime);
    applyFilter(filter, y, ctx, filterEnabled);

    if (startAt && startAt > ctx.currentTime) {
      // Quantized start: silence until scheduled time
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setValueAtTime(finalVolume, startAt);
      source.start(startAt);
      console.log(`[Quantize] Orb ${orbId} scheduled at ${startAt.toFixed(3)}s (in ${(startAt - ctx.currentTime).toFixed(3)}s)`);
    } else {
      // Immediate start
      gain.gain.setValueAtTime(finalVolume, ctx.currentTime);
      source.start(0);
    }

    nodesRef.current.set(orbId, { source, gain, filter, panner, analyser, reverbSendLPF, startAt, filterEnabled });
  }, []);

  const stopSound = useCallback((orbId) => {
    const nodes = nodesRef.current.get(orbId);
    if (nodes) {
      try {
        nodes.source.stop();
        nodes.source.disconnect();
        nodes.filter.disconnect();
        nodes.gain.disconnect();
        nodes.panner.disconnect();
        nodes.analyser.disconnect();
        if (nodes.reverbSendLPF) nodes.reverbSendLPF.disconnect();
      } catch (e) {
        // Already stopped
      }
      nodesRef.current.delete(orbId);
    }
  }, []);

  const updateSound = useCallback((orbId, x, y, size, muted, filterEnabled = true, reverbLpfFreq = 3500) => {
    const nodes = nodesRef.current.get(orbId);
    if (!nodes) return;

    const ctx = getAudioContext();

    const t = Math.max(0, Math.min(1, size / 200));
    const baseVolume = t * t * t;
    const compensation = filterEnabled ? getFilterCompensation(y) : 1.0;
    const finalVolume = muted ? 0 : Math.min(1.5, baseVolume * compensation);
    nodes.gain.gain.setTargetAtTime(finalVolume, ctx.currentTime, 0.05);

    const panValue = (x * 2) - 1;
    nodes.panner.pan.setTargetAtTime(
      Math.max(-1, Math.min(1, panValue)),
      ctx.currentTime,
      0.05
    );

    applyFilter(nodes.filter, y, ctx, filterEnabled);

    // Update per-orb reverb send LPF based on y position
    if (nodes.reverbSendLPF) {
      updateReverbSendLPF(nodes.reverbSendLPF, y, ctx, filterEnabled, reverbLpfFreq);
    }
  }, []);

  const getAmplitude = useCallback((orbId) => {
    const nodes = nodesRef.current.get(orbId);
    if (!nodes) return 0;

    const dataArray = new Uint8Array(nodes.analyser.frequencyBinCount);
    nodes.analyser.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const val = (dataArray[i] - 128) / 128;
      sum += val * val;
    }
    return Math.sqrt(sum / dataArray.length);
  }, []);

  const decodeAudio = useCallback(async (arrayBuffer) => {
    const ctx = getAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return normalizeLUFS(audioBuffer, -30);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      nodesRef.current.forEach((nodes) => {
        try {
          nodes.source.stop();
          nodes.source.disconnect();
          nodes.filter.disconnect();
          nodes.gain.disconnect();
          nodes.panner.disconnect();
          nodes.analyser.disconnect();
          if (nodes.reverbSendLPF) nodes.reverbSendLPF.disconnect();
        } catch (e) {}
      });
      nodesRef.current.clear();
    };
  }, []);

  // Get the actual frequency response from the BiquadFilter node
  const getFilterResponse = useCallback((orbId) => {
    const nodes = nodesRef.current.get(orbId);
    if (!nodes) return null;

    const numPoints = 200;
    const frequencies = new Float32Array(numPoints);
    const magResponse = new Float32Array(numPoints);
    const phaseResponse = new Float32Array(numPoints);

    for (let i = 0; i < numPoints; i++) {
      frequencies[i] = 20 * Math.pow(20000 / 20, i / (numPoints - 1));
    }

    nodes.filter.getFrequencyResponse(frequencies, magResponse, phaseResponse);

    return { frequencies, magResponse };
  }, []);

  return { startSound, stopSound, updateSound, getAmplitude, getFilterResponse, decodeAudio };
}

// Update per-orb reverb send LPF: uses preset base freq, tracks HPF when HPF > base freq
function updateReverbSendLPF(lpfNode, y, ctx, filterEnabled = true, baseLpfFreq = 3500) {
  let freq = baseLpfFreq;

  if (filterEnabled && y < 0.4) {
    // Calculate HPF frequency (same formula as applyFilter)
    const t = 1 - (y / 0.4);
    const hpfFreq = 20 * Math.pow(8000 / 20, t);
    // Reverb LPF tracks HPF × 1.3 when HPF > base freq
    freq = Math.max(baseLpfFreq, hpfFreq * 1.3);
  }

  lpfNode.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
}

function applyFilter(filter, y, ctx, filterEnabled = true) {
  if (!filterEnabled) {
    filter.type = 'lowpass';
    filter.frequency.setTargetAtTime(20000, ctx.currentTime, 0.05);
    filter.Q.setValueAtTime(0.5, ctx.currentTime);
    return;
  }
  if (y < 0.4) {
    filter.type = 'highpass';
    const t = 1 - (y / 0.4);
    const freq = 20 * Math.pow(8000 / 20, t);
    filter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
  } else if (y > 0.6) {
    filter.type = 'lowpass';
    const t = (y - 0.6) / 0.4;
    const freq = 20000 * Math.pow(50 / 20000, t);
    filter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
  } else {
    filter.type = 'lowpass';
    filter.frequency.setTargetAtTime(20000, ctx.currentTime, 0.05);
  }
  filter.Q.setValueAtTime(0.5, ctx.currentTime);
}

// ===== ITU-R BS.1770 Integrated LUFS measurement + normalization =====

function applyKWeighting(samples, sampleRate) {
  const out = new Float32Array(samples.length);

  const f0_1 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q_1 = 0.7071752369554196;

  const K1 = Math.tan(Math.PI * f0_1 / sampleRate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0_1 = 1 + K1 / Q_1 + K1 * K1;
  const b0_1 = (Vh + Vb * K1 / Q_1 + K1 * K1) / a0_1;
  const b1_1 = 2 * (K1 * K1 - Vh) / a0_1;
  const b2_1 = (Vh - Vb * K1 / Q_1 + K1 * K1) / a0_1;
  const a1_1 = 2 * (K1 * K1 - 1) / a0_1;
  const a2_1 = (1 - K1 / Q_1 + K1 * K1) / a0_1;

  const f0_2 = 38.13547087602444;
  const Q_2 = 0.5003270373238773;
  const K2 = Math.tan(Math.PI * f0_2 / sampleRate);
  const a0_2 = 1 + K2 / Q_2 + K2 * K2;
  const b0_2 = 1 / a0_2;
  const b1_2 = -2 / a0_2;
  const b2_2 = 1 / a0_2;
  const a1_2 = 2 * (K2 * K2 - 1) / a0_2;
  const a2_2 = (1 - K2 / Q_2 + K2 * K2) / a0_2;

  let x1_1 = 0, x2_1 = 0, y1_1 = 0, y2_1 = 0;
  const temp = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0_1 * x + b1_1 * x1_1 + b2_1 * x2_1 - a1_1 * y1_1 - a2_1 * y2_1;
    x2_1 = x1_1; x1_1 = x;
    y2_1 = y1_1; y1_1 = y;
    temp[i] = y;
  }

  let x1_2 = 0, x2_2 = 0, y1_2 = 0, y2_2 = 0;
  for (let i = 0; i < temp.length; i++) {
    const x = temp[i];
    const y = b0_2 * x + b1_2 * x1_2 + b2_2 * x2_2 - a1_2 * y1_2 - a2_2 * y2_2;
    x2_2 = x1_2; x1_2 = x;
    y2_2 = y1_2; y1_2 = y;
    out[i] = y;
  }

  return out;
}

function measureIntegratedLUFS(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;

  const channelWeights = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelWeights.push(1.0);
  }

  const kWeighted = [];
  for (let ch = 0; ch < numChannels; ch++) {
    kWeighted.push(applyKWeighting(audioBuffer.getChannelData(ch), sampleRate));
  }

  const blockSize = Math.round(sampleRate * 0.4);
  const stepSize = Math.round(sampleRate * 0.1);
  const blockLoudness = [];

  for (let start = 0; start + blockSize <= length; start += stepSize) {
    let blockPower = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = kWeighted[ch];
      let chSum = 0;
      for (let i = start; i < start + blockSize; i++) {
        chSum += data[i] * data[i];
      }
      blockPower += channelWeights[ch] * (chSum / blockSize);
    }
    const blockLUFS = -0.691 + 10 * Math.log10(blockPower);
    blockLoudness.push(blockLUFS);
  }

  if (blockLoudness.length === 0) {
    let power = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = kWeighted[ch];
      let chSum = 0;
      for (let i = 0; i < length; i++) {
        chSum += data[i] * data[i];
      }
      power += channelWeights[ch] * (chSum / length);
    }
    return power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity;
  }

  const gated70 = blockLoudness.filter(l => l > -70);
  if (gated70.length === 0) return -Infinity;

  let sumPower70 = 0;
  for (const l of gated70) {
    sumPower70 += Math.pow(10, (l + 0.691) / 10);
  }
  const meanPower70 = sumPower70 / gated70.length;
  const relativeThreshold = -0.691 + 10 * Math.log10(meanPower70) - 10;

  const gatedRelative = blockLoudness.filter(l => l > relativeThreshold);
  if (gatedRelative.length === 0) return -Infinity;

  let sumPowerRel = 0;
  for (const l of gatedRelative) {
    sumPowerRel += Math.pow(10, (l + 0.691) / 10);
  }
  const meanPowerRel = sumPowerRel / gatedRelative.length;

  return -0.691 + 10 * Math.log10(meanPowerRel);
}

function normalizeLUFS(audioBuffer, targetLUFS = -30) {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;

  const currentLUFS = measureIntegratedLUFS(audioBuffer);

  if (!isFinite(currentLUFS)) {
    console.warn('[LUFS] Could not measure loudness (silent?), skipping normalization');
    return audioBuffer;
  }

  const gainDB = targetLUFS - currentLUFS;
  const gainLinear = Math.pow(10, gainDB / 20);
  const clampedGain = Math.min(Math.max(gainLinear, 0.01), 10);

  const ctx = getAudioContext();
  const normalizedBuffer = ctx.createBuffer(numChannels, length, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const inputData = audioBuffer.getChannelData(ch);
    const outputData = normalizedBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      outputData[i] = inputData[i] * clampedGain;
    }
  }

  const verifyLUFS = measureIntegratedLUFS(normalizedBuffer);

  console.log(`[LUFS] Input: ${currentLUFS.toFixed(1)} LUFS (integrated, ITU-R BS.1770)`);
  console.log(`[LUFS] Target: ${targetLUFS} LUFS`);
  console.log(`[LUFS] Gain applied: ${gainDB.toFixed(1)} dB (linear: ${clampedGain.toFixed(4)})`);
  console.log(`[LUFS] Output: ${verifyLUFS.toFixed(1)} LUFS (verified)`);

  return normalizedBuffer;
}

// Export an AudioBuffer as a WAV file download
export function exportAudioBufferAsWav(audioBuffer, filename) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export default useAudioEngine;
