import { useRef, useEffect } from 'react';

// Draws the real frequency response from the Web Audio API BiquadFilterNode
export default function FilterCurve({ orbId, orbName, getFilterResponse, onClose }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    let running = true;

    const draw = () => {
      if (!running) return;

      const response = getFilterResponse(orbId);
      if (response) {
        drawCurve(canvasRef.current, response);
      }

      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      running = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [orbId, getFilterResponse]);

  return (
    <div className="filter-curve-panel">
      <div className="filter-curve-header">
        <span className="filter-curve-title">Filter: {orbName}</span>
        <button className="filter-curve-close" onClick={onClose}>×</button>
      </div>
      <canvas ref={canvasRef} width={500} height={220} className="filter-curve-canvas" />
    </div>
  );
}

function drawCurve(canvas, response) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const pad = { top: 10, bottom: 25, left: 45, right: 10 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#f8f8fc';
  ctx.fillRect(0, 0, w, h);

  // Plot area background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pad.left, pad.top, plotW, plotH);

  // dB range: -36 to +12
  const minDb = -36;
  const maxDb = 12;
  const dbRange = maxDb - minDb;

  // Freq range: 20Hz to 20kHz (log)
  const minFreq = 20;
  const maxFreq = 20000;

  const freqToX = (f) => {
    const t = Math.log10(f / minFreq) / Math.log10(maxFreq / minFreq);
    return pad.left + t * plotW;
  };

  const dbToY = (db) => {
    const clamped = Math.max(minDb, Math.min(maxDb, db));
    return pad.top + (1 - (clamped - minDb) / dbRange) * plotH;
  };

  // Grid lines — dB
  ctx.strokeStyle = '#e8e8f0';
  ctx.lineWidth = 0.5;
  ctx.font = '9px DM Sans, sans-serif';
  ctx.textAlign = 'right';

  for (let db = minDb; db <= maxDb; db += 6) {
    const y = dbToY(db);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();

    ctx.fillStyle = db === 0 ? '#333' : '#aaa';
    ctx.fillText(`${db > 0 ? '+' : ''}${db}`, pad.left - 4, y + 3);
  }

  // 0dB reference line
  const zeroY = dbToY(0);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(pad.left + plotW, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Grid lines — frequency
  ctx.textAlign = 'center';
  const freqLines = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const freqLabels = ['20', '50', '100', '200', '500', '1k', '2k', '5k', '10k', '20k'];

  for (let i = 0; i < freqLines.length; i++) {
    const x = freqToX(freqLines[i]);
    ctx.strokeStyle = '#e8e8f0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();

    ctx.fillStyle = '#aaa';
    ctx.fillText(freqLabels[i], x, h - 6);
  }

  // Draw the actual response curve
  const { frequencies, magResponse } = response;

  // Fill area under curve
  ctx.beginPath();
  ctx.moveTo(freqToX(frequencies[0]), dbToY(0));
  for (let i = 0; i < frequencies.length; i++) {
    const x = freqToX(frequencies[i]);
    const db = 20 * Math.log10(magResponse[i]);
    const y = dbToY(db);
    if (i === 0) ctx.lineTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(freqToX(frequencies[frequencies.length - 1]), dbToY(0));
  ctx.closePath();
  ctx.fillStyle = 'rgba(245, 197, 24, 0.15)';
  ctx.fill();

  // Stroke curve
  ctx.beginPath();
  for (let i = 0; i < frequencies.length; i++) {
    const x = freqToX(frequencies[i]);
    const db = 20 * Math.log10(magResponse[i]);
    const y = dbToY(db);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#d4a810';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Mark the cutoff frequency (where magnitude ≈ -3dB)
  for (let i = 1; i < frequencies.length; i++) {
    const db = 20 * Math.log10(magResponse[i]);
    const prevDb = 20 * Math.log10(magResponse[i - 1]);
    if ((prevDb >= -3 && db < -3) || (prevDb <= -3 && db > -3)) {
      const x = freqToX(frequencies[i]);
      const y = dbToY(db);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#e91e8c';
      ctx.fill();

      ctx.fillStyle = '#e91e8c';
      ctx.font = 'bold 9px DM Sans, sans-serif';
      ctx.textAlign = 'left';
      const freqStr = frequencies[i] >= 1000
        ? `${(frequencies[i] / 1000).toFixed(1)}kHz`
        : `${Math.round(frequencies[i])}Hz`;
      ctx.fillText(`-3dB @ ${freqStr}`, x + 8, y - 4);
      break;
    }
  }

  // Mark clipping zone
  ctx.fillStyle = 'rgba(231, 76, 60, 0.08)';
  ctx.fillRect(pad.left, pad.top, plotW, dbToY(0) - pad.top);

  // Axis labels
  ctx.fillStyle = '#888';
  ctx.font = '9px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Hz', w - 12, h - 6);

  ctx.save();
  ctx.translate(10, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('dB', 0, 0);
  ctx.restore();
}
