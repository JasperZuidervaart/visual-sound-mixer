import { useRef, useState, useEffect, useCallback } from 'react';

// Size range: min 50px, max 200px (bigger orbs, more scaling room)
const MIN_SIZE = 50;
const MAX_SIZE = 200;

export default function SoundOrb({
  orb,
  containerRect,
  onUpdate,
  onRemove,
  onToggleMute,
  onSelect,
  isSelected,
  getAmplitude,
  globalMuted,
  hasBackground = false,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ y: 0, size: 0 });
  const orbRef = useRef(null);
  const offsetRef = useRef(0);
  const animFrameRef = useRef(null);

  // Vibratie animatie — scale-based but targeting fixed pixel growth
  useEffect(() => {
    let running = true;

    const animate = () => {
      if (!running) return;
      const amp = getAmplitude(orb.id);
      const boosted = Math.sqrt(amp);
      // Target 12px growth regardless of orb size, converted to scale
      const pixelGrow = boosted * 12;
      const targetScale = 1 + pixelGrow / orb.size;
      offsetRef.current += (targetScale - offsetRef.current) * 0.18;

      if (orbRef.current) {
        orbRef.current.style.transform = `translate(-50%, -50%) scale(${offsetRef.current})`;
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [orb.id, getAmplitude]);

  // Position drag: left mouse button on orb core
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    // Don't start drag if clicking on resize handle or buttons
    if (e.target.closest('.orb-resize-handle') || e.target.closest('.orb-remove') || e.target.closest('.orb-mute')) return;

    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);

    const rect = containerRect();
    dragOffset.current = {
      x: e.clientX - (orb.x * rect.width),
      y: e.clientY - (orb.y * rect.height),
    };
  }, [orb.x, orb.y, containerRect]);

  // Resize drag: on the resize handle (bottom edge)
  const handleResizeMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStart.current = { y: e.clientY, size: orb.size };
  }, [orb.size]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const rect = containerRect();
      const newX = Math.max(0, Math.min(1, (e.clientX - dragOffset.current.x) / rect.width));
      const newY = Math.max(0, Math.min(1, (e.clientY - dragOffset.current.y) / rect.height));
      onUpdate(orb.id, { x: newX, y: newY });
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, orb.id, onUpdate, containerRect]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      // Drag up = bigger, drag down = smaller
      const delta = resizeStart.current.y - e.clientY;
      const newSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, resizeStart.current.size + delta));
      onUpdate(orb.id, { size: newSize });
    };

    const handleMouseUp = () => setIsResizing(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, orb.id, onUpdate]);

  // Scroll wheel also adjusts volume
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -5 : 5;
    const newSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, orb.size + delta));
    onUpdate(orb.id, { size: newSize });
  }, [orb.id, orb.size, onUpdate]);

  const tVol = Math.max(0, Math.min(1, orb.size / MAX_SIZE));
  const volume = Math.round(tVol * tVol * tVol * 100);
  const isMuted = orb.muted || globalMuted;

  // Compute debug filter info (mirrors audio engine logic)
  const debugInfo = getFilterDebugInfo(orb.x, orb.y, orb.size);

  // Generate color variants for glow/ring
  const orbColor = orb.color || '#f5c518';
  const ringColor = orbColor + '40'; // 25% opacity

  return (
    <div
      ref={orbRef}
      className={`sound-orb ${isDragging ? 'dragging' : ''} ${isMuted ? 'muted' : ''} ${isSelected ? 'selected' : ''} ${orb.waiting ? 'waiting' : ''} ${hasBackground ? 'has-background' : ''}`}
      onDoubleClick={(e) => { e.stopPropagation(); onSelect(orb.id); }}
      style={{
        left: `${orb.x * 100}%`,
        top: `${orb.y * 100}%`,
        width: `${orb.size}px`,
        height: `${orb.size}px`,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onWheel={handleWheel}
    >
      <div className="orb-rings">
        {!isMuted && (
          <>
            <div className="orb-ring ring-1" style={{ borderColor: ringColor }} />
            <div className="orb-ring ring-2" style={{ borderColor: ringColor }} />
            <div className="orb-ring ring-3" style={{ borderColor: ringColor }} />
          </>
        )}
      </div>
      <div
        className="orb-core"
        style={{
          background: isMuted ? '#ccc' : orbColor,
          boxShadow: isMuted
            ? '0 2px 8px rgba(0, 0, 0, 0.1)'
            : `0 2px 12px ${orbColor}4D`,
        }}
      >
        <span className="orb-label">{orb.name}</span>
        <span className="orb-volume">{isMuted ? 'MUTE' : `${volume}%`}</span>
      </div>

      {/* Resize handle — drag up/down to change volume */}
      <div
        className="orb-resize-handle"
        onMouseDown={handleResizeMouseDown}
        title="Drag up/down to change volume"
      >
        <svg width="12" height="6" viewBox="0 0 12 6">
          <line x1="2" y1="1.5" x2="10" y2="1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="2" y1="4.5" x2="10" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      {/* Debug info tooltip */}
      <div className="orb-debug">
        {debugInfo.filterType} {debugInfo.freq} · Pan {debugInfo.pan} · Gain {debugInfo.gain} · Comp {debugInfo.comp}
      </div>

      {isHovered && (
        <>
          <button
            className="orb-mute"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute(orb.id);
            }}
            title={orb.muted ? 'Unmute' : 'Mute'}
          >
            {orb.muted ? '🔇' : '🔊'}
          </button>
          <button
            className="orb-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(orb.id);
            }}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}

function getFilterDebugInfo(x, y, size) {
  let filterType = '—';
  let freq = '20kHz';

  if (y < 0.4) {
    filterType = 'HPF';
    const t = 1 - (y / 0.4);
    const f = 20 * Math.pow(8000 / 20, t);
    freq = f >= 1000 ? `${(f / 1000).toFixed(1)}kHz` : `${Math.round(f)}Hz`;
  } else if (y > 0.6) {
    filterType = 'LPF';
    const t = (y - 0.6) / 0.4;
    const f = 20000 * Math.pow(50 / 20000, t);
    freq = f >= 1000 ? `${(f / 1000).toFixed(1)}kHz` : `${Math.round(f)}Hz`;
  } else {
    filterType = 'OFF';
    freq = '';
  }

  const panValue = (x * 2) - 1;
  const panStr = panValue < -0.05 ? `L${Math.round(Math.abs(panValue) * 100)}` :
                 panValue > 0.05 ? `R${Math.round(panValue * 100)}` : 'C';

  // Exponential volume mapping: (size/200)^3, range -36dB to 0dB
  const MAX_SIZE = 200;
  const t = Math.max(0, Math.min(1, size / MAX_SIZE));
  const baseVol = t * t * t;
  const gainDb = baseVol > 0 ? (20 * Math.log10(baseVol)).toFixed(1) : '-∞';

  // Mirror getFilterCompensation from audio engine
  let comp = 1.0;
  if (y < 0.4) {
    const t = 1 - (y / 0.4);
    comp = 1.0 - t * 0.15;
  } else if (y > 0.6) {
    const t = (y - 0.6) / 0.4;
    comp = 1.0 + t * t * 0.8;
  }
  const compDb = (20 * Math.log10(comp)).toFixed(1);
  const compStr = comp >= 1 ? `+${compDb}` : compDb;

  return { filterType, freq, pan: panStr, gain: `${gainDb}dB`, comp: `${compStr}dB` };
}
