// Beat clock utility — calculates quantized timing based on AudioContext.currentTime
// Uses a single reference point to keep all orbs on the same grid

let startTime = null;

export function initBeatClock(audioContext) {
  if (startTime === null) {
    startTime = audioContext.currentTime;
  }
}

export function resetBeatClock(audioContext) {
  startTime = audioContext.currentTime;
}

/**
 * Get the AudioContext time of the next bar start (downbeat).
 * @param {AudioContext} audioContext
 * @param {number} bpm - beats per minute
 * @param {number} beatsPerBar - beats per bar (default 4 for 4/4)
 * @returns {number} scheduled start time in AudioContext seconds
 */
export function getNextBarTime(audioContext, bpm, beatsPerBar = 4) {
  initBeatClock(audioContext);

  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * beatsPerBar;
  const elapsed = audioContext.currentTime - startTime;
  const currentBar = Math.floor(elapsed / barDuration);
  const nextBarStart = startTime + (currentBar + 1) * barDuration;

  // If the next bar is very close (< 50ms), skip to the one after
  // to avoid timing glitches
  if (nextBarStart - audioContext.currentTime < 0.05) {
    return nextBarStart + barDuration;
  }

  return nextBarStart;
}

/**
 * Get the AudioContext time of the next beat (quarter note).
 * @param {AudioContext} audioContext
 * @param {number} bpm
 * @returns {number} scheduled start time
 */
export function getNextBeatTime(audioContext, bpm) {
  initBeatClock(audioContext);

  const beatDuration = 60 / bpm;
  const elapsed = audioContext.currentTime - startTime;
  const currentBeat = Math.floor(elapsed / beatDuration);
  const nextBeatStart = startTime + (currentBeat + 1) * beatDuration;

  if (nextBeatStart - audioContext.currentTime < 0.05) {
    return nextBeatStart + beatDuration;
  }

  return nextBeatStart;
}
