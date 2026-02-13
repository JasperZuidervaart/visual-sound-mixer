import { useRef, useCallback, useEffect, useState } from 'react';
import useSoundStore from '../stores/useSoundStore';
import { useAudioEngine, resumeAudioContext, updateReverbGlobalGain } from '../hooks/useAudioEngine';
import { getNextBarTime } from '../lib/beatClock';
import SoundOrb from './SoundOrb';
import FilterCurve from './FilterCurve';

// We need access to AudioContext for beat clock
function getAudioContext() {
  return window.__audioCtx || (window.AudioContext && new AudioContext());
}

export default function MixerField({ mode = 'admin', visibleControls = null, showOrbRemove = true }) {
  const isPlayer = mode === 'player';
  // Default: all controls visible
  const vc = visibleControls || {
    globalMute: true, reverbToggle: true, reverbSendSlider: true,
    reverbLpfSlider: true, filterToggle: true, quantizeToggle: true, bpmControl: true,
  };
  const fieldRef = useRef(null);
  const orbs = useSoundStore((s) => s.orbs);
  const globalMuted = useSoundStore((s) => s.globalMuted);
  const toggleGlobalMute = useSoundStore((s) => s.toggleGlobalMute);
  const addOrb = useSoundStore((s) => s.addOrb);
  const updateOrb = useSoundStore((s) => s.updateOrb);
  const removeOrb = useSoundStore((s) => s.removeOrb);
  const toggleMute = useSoundStore((s) => s.toggleMute);

  // Preset-based settings (read from active preset via selectors)
  const presets = useSoundStore((s) => s.presets);
  const activePresetId = useSoundStore((s) => s.activePresetId);
  const activePreset = presets.find((p) => p.id === activePresetId);
  const bpm = activePreset?.bpm || 120;
  const quantizeEnabled = activePreset?.quantizeEnabled ?? true;
  const reverbEnabled = activePreset?.reverbEnabled ?? false;
  const reverbSendLevel = activePreset?.reverbSendLevel ?? 0.5;
  const reverbLpfFreq = activePreset?.reverbLpfFreq ?? 3500;
  const filterEnabled = activePreset?.filterEnabled ?? true;
  const backgroundImage = activePreset?.backgroundImage ?? null;

  const setBpm = useSoundStore((s) => s.setBpm);
  const toggleQuantize = useSoundStore((s) => s.toggleQuantize);
  const toggleReverb = useSoundStore((s) => s.toggleReverb);
  const setReverbSendLevel = useSoundStore((s) => s.setReverbSendLevel);
  const setReverbLpfFreq = useSoundStore((s) => s.setReverbLpfFreq);
  const toggleFilter = useSoundStore((s) => s.toggleFilter);

  const { startSound, stopSound, updateSound, getAmplitude, getFilterResponse } = useAudioEngine();

  const [selectedOrbId, setSelectedOrbId] = useState(null);
  const [bpmInput, setBpmInput] = useState(String(bpm));

  // Keep bpmInput in sync with store bpm
  useEffect(() => {
    setBpmInput(String(bpm));
  }, [bpm]);

  // Track active orbs for audio start/stop
  const activeOrbsRef = useRef(new Set());
  // Track scheduled start times for waiting orbs
  const scheduledStartsRef = useRef(new Map());

  // Sync reverb global gain with store state
  useEffect(() => {
    updateReverbGlobalGain(reverbEnabled && !globalMuted, reverbSendLevel);
  }, [reverbEnabled, reverbSendLevel, globalMuted]);

  useEffect(() => {
    const currentIds = new Set(orbs.map((o) => o.id));

    // Start new orbs
    for (const orb of orbs) {
      if (!activeOrbsRef.current.has(orb.id)) {
        const startAt = scheduledStartsRef.current.get(orb.id) || null;
        startSound(orb.id, orb.audioBuffer, orb.x, orb.y, orb.size, orb.muted || globalMuted, startAt, filterEnabled, reverbLpfFreq);
        activeOrbsRef.current.add(orb.id);

        // If quantized, set up timer to clear "waiting" state
        if (startAt) {
          const ctx = document.querySelector('audio')?.context || window.__audioCtx;
          // Use a simple timeout based on delay
          const delayMs = Math.max(0, (startAt - (window.__audioCtx?.currentTime || 0)) * 1000);
          setTimeout(() => {
            updateOrb(orb.id, { waiting: false });
            scheduledStartsRef.current.delete(orb.id);
          }, delayMs);
        }
      }
    }

    // Stop removed orbs
    for (const id of activeOrbsRef.current) {
      if (!currentIds.has(id)) {
        stopSound(id);
        activeOrbsRef.current.delete(id);
        scheduledStartsRef.current.delete(id);
      }
    }
  }, [orbs, startSound, stopSound, globalMuted, updateOrb, filterEnabled, reverbLpfFreq]);

  // Update audio params when orb position/size/mute changes
  useEffect(() => {
    for (const orb of orbs) {
      updateSound(orb.id, orb.x, orb.y, orb.size, orb.muted || globalMuted, filterEnabled, reverbLpfFreq);
    }
  }, [orbs, updateSound, globalMuted, filterEnabled, reverbLpfFreq]);

  // Clear selection if orb is removed
  useEffect(() => {
    if (selectedOrbId && !orbs.find((o) => o.id === selectedOrbId)) {
      setSelectedOrbId(null);
    }
  }, [orbs, selectedOrbId]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    resumeAudioContext();

    const soundId = parseInt(e.dataTransfer.getData('soundId'), 10);
    if (!soundId) return;

    const rect = fieldRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // If quantize enabled, calculate next bar time
    if (quantizeEnabled && window.__audioCtx) {
      const nextBar = getNextBarTime(window.__audioCtx, bpm, 4);
      // We need to know the orb ID before it's created, so we store
      // a pending scheduled time and apply it in the useEffect
      const pendingOrbId = addOrbWithSchedule(soundId, x, y, nextBar);
    } else {
      addOrb(soundId, Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
    }
  };

  // Add orb with a scheduled start time
  const addOrbWithSchedule = useCallback((soundId, x, y, startAt) => {
    // First add the orb in waiting state
    const store = useSoundStore.getState();
    const libraryItem = store.libraryItems.find((item) => item.id === soundId);
    if (!libraryItem) return;

    // We'll add the orb, then immediately get its ID to schedule
    addOrb(soundId, Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));

    // Get the newly added orb (last one in the array)
    const newState = useSoundStore.getState();
    const newOrb = newState.orbs[newState.orbs.length - 1];
    if (newOrb) {
      scheduledStartsRef.current.set(newOrb.id, startAt);
      updateOrb(newOrb.id, { waiting: true });
    }
  }, [addOrb, updateOrb]);

  const handleRemoveOrb = useCallback((orbId) => {
    stopSound(orbId);
    activeOrbsRef.current.delete(orbId);
    removeOrb(orbId);
  }, [stopSound, removeOrb]);

  const getContainerRect = useCallback(() => {
    return fieldRef.current?.getBoundingClientRect() || { width: 1, height: 1 };
  }, []);

  const handleSelectOrb = useCallback((orbId) => {
    setSelectedOrbId((prev) => (prev === orbId ? null : orbId));
  }, []);

  const handleBpmInputChange = (e) => {
    setBpmInput(e.target.value);
  };

  const handleBpmInputBlur = () => {
    const val = parseInt(bpmInput, 10);
    if (!isNaN(val)) {
      setBpm(val);
    } else {
      setBpmInput(String(bpm));
    }
  };

  const handleBpmInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  const selectedOrb = orbs.find((o) => o.id === selectedOrbId);

  return (
    <div
      ref={fieldRef}
      className="mixer-field"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={(e) => {
        resumeAudioContext();
        if (e.target === fieldRef.current || e.target.classList.contains('mixer-grid')) {
          setSelectedOrbId(null);
        }
      }}
    >
      {/* Background image */}
      {backgroundImage && (
        <div
          className="mixer-background"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      )}

      {/* Axis labels */}
      <div className="axis-label axis-left">L</div>
      <div className="axis-label axis-right">R</div>
      {filterEnabled && <div className="axis-label axis-top">HPF</div>}
      {filterEnabled && <div className="axis-label axis-bottom">LPF</div>}

      {/* Grid */}
      <div className={`mixer-grid ${backgroundImage ? 'has-background' : ''}`} />

      {/* Top-right controls */}
      <div className="mixer-controls">
        {/* Global mute button */}
        {vc.globalMute && (
          <button
            className={`control-button ${globalMuted ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleGlobalMute();
            }}
            title={globalMuted ? 'Unmute all' : 'Mute all'}
          >
            {globalMuted ? 'MUTED' : 'MUTE'}
          </button>
        )}

        {/* Reverb toggle */}
        {vc.reverbToggle && (
          <button
            className={`control-button reverb-button ${reverbEnabled ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              resumeAudioContext();
              toggleReverb();
            }}
            title={reverbEnabled ? 'Disable reverb' : 'Enable reverb'}
          >
            {reverbEnabled ? '🔔 REVERB ON' : '🔕 REVERB'}
          </button>
        )}

        {/* Reverb wet/dry slider */}
        {reverbEnabled && vc.reverbSendSlider && (
          <div className="reverb-slider-container" onClick={(e) => e.stopPropagation()}>
            <label className="reverb-slider-label">
              Send: {Math.round(reverbSendLevel * 100)}%
            </label>
            <input
              type="range"
              className="reverb-slider"
              min="0"
              max="100"
              value={Math.round(reverbSendLevel * 100)}
              onChange={(e) => setReverbSendLevel(parseInt(e.target.value, 10) / 100)}
            />
          </div>
        )}

        {/* Reverb LPF slider */}
        {reverbEnabled && vc.reverbLpfSlider && (
          <div className="reverb-slider-container" onClick={(e) => e.stopPropagation()}>
            <label className="reverb-slider-label">
              LPF: {reverbLpfFreq >= 10000 ? `${(reverbLpfFreq / 1000).toFixed(1)}k` : reverbLpfFreq >= 1000 ? `${(reverbLpfFreq / 1000).toFixed(1)}k` : `${Math.round(reverbLpfFreq)}`} Hz
            </label>
            <input
              type="range"
              className="reverb-slider"
              min="0"
              max="100"
              value={Math.round(Math.log(reverbLpfFreq / 200) / Math.log(20000 / 200) * 100)}
              onChange={(e) => {
                const t = parseInt(e.target.value, 10) / 100;
                setReverbLpfFreq(Math.round(200 * Math.pow(20000 / 200, t)));
              }}
            />
          </div>
        )}

        {/* Filter toggle */}
        {vc.filterToggle && (
          <button
            className={`control-button filter-button ${filterEnabled ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFilter();
            }}
            title={filterEnabled ? 'Disable HPF/LPF filter' : 'Enable HPF/LPF filter'}
          >
            {filterEnabled ? 'FILTER ON' : 'FILTER OFF'}
          </button>
        )}

        {/* Quantize toggle */}
        {vc.quantizeToggle && (
          <button
            className={`control-button quantize-button ${quantizeEnabled ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleQuantize();
            }}
            title={quantizeEnabled ? 'Disable grid quantize' : 'Enable grid quantize'}
          >
            {quantizeEnabled ? '⏱ GRID ON' : '⏱ GRID'}
          </button>
        )}

        {/* BPM control */}
        {vc.bpmControl && (
          <div className="bpm-control" onClick={(e) => e.stopPropagation()}>
            <input
              type="number"
              className="bpm-input"
              min="40"
              max="240"
              value={bpmInput}
              onChange={handleBpmInputChange}
              onBlur={handleBpmInputBlur}
              onKeyDown={handleBpmInputKeyDown}
            />
            <span className="bpm-label">BPM</span>
            <input
              type="range"
              className="bpm-slider"
              min="40"
              max="240"
              value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value, 10))}
            />
          </div>
        )}
      </div>

      {/* Drop hint */}
      {orbs.length === 0 && (
        <div className="mixer-empty">
          Drag sounds here
        </div>
      )}

      {/* Orbs */}
      {orbs.map((orb) => (
        <SoundOrb
          key={orb.id}
          orb={orb}
          containerRect={getContainerRect}
          onUpdate={updateOrb}
          onRemove={handleRemoveOrb}
          onToggleMute={toggleMute}
          onSelect={handleSelectOrb}
          isSelected={orb.id === selectedOrbId}
          getAmplitude={getAmplitude}
          globalMuted={globalMuted}
          hasBackground={!!backgroundImage}
          mode={mode}
          showRemove={!isPlayer || showOrbRemove}
        />
      ))}

      {/* Filter curve panel (only in admin mode and when filter is enabled) */}
      {!isPlayer && selectedOrb && filterEnabled && (
        <FilterCurve
          orbId={selectedOrb.id}
          orbName={selectedOrb.name}
          getFilterResponse={getFilterResponse}
          onClose={() => setSelectedOrbId(null)}
        />
      )}
    </div>
  );
}
