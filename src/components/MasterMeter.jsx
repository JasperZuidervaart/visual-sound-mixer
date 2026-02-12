import { useRef, useEffect, useState } from 'react';
import { getMasterAnalyser } from '../hooks/useAudioEngine';

export default function MasterMeter() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const peakRef = useRef(-Infinity);
  const peakHoldRef = useRef(0);
  const [dbValue, setDbValue] = useState(-Infinity);

  useEffect(() => {
    let running = true;
    const analyser = getMasterAnalyser();
    const dataArray = new Float32Array(analyser.fftSize);

    const draw = () => {
      if (!running) return;

      analyser.getFloatTimeDomainData(dataArray);

      // Compute RMS
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const abs = Math.abs(dataArray[i]);
        sum += dataArray[i] * dataArray[i];
        if (abs > peak) peak = abs;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      // Convert to dBFS
      const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
      const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;

      // Peak hold with decay
      if (peakDb > peakRef.current) {
        peakRef.current = peakDb;
        peakHoldRef.current = 60; // hold for 60 frames (~1s)
      } else if (peakHoldRef.current > 0) {
        peakHoldRef.current--;
      } else {
        peakRef.current = Math.max(peakRef.current - 0.5, peakDb);
      }

      setDbValue(rmsDb);
      drawMeter(canvasRef.current, rmsDb, peakDb, peakRef.current);

      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      running = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const displayDb = dbValue > -100 ? dbValue.toFixed(1) : '-∞';

  return (
    <div className="master-meter">
      <div className="meter-label">dBFS</div>
      <canvas ref={canvasRef} width={32} height={300} className="meter-canvas" />
      <div className="meter-value">{displayDb}</div>
    </div>
  );
}

function drawMeter(canvas, rmsDb, peakDb, peakHold) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, w, h);

  // dB range: -60 to 0
  const minDb = -60;
  const maxDb = 0;

  // dB to Y position (0dB at top, -60 at bottom)
  const dbToY = (db) => {
    const clamped = Math.max(minDb, Math.min(maxDb, db));
    return h - ((clamped - minDb) / (maxDb - minDb)) * h;
  };

  // Draw scale lines
  ctx.fillStyle = '#ccc';
  ctx.font = '8px DM Sans, sans-serif';
  ctx.textAlign = 'right';
  for (let db = 0; db >= -60; db -= 6) {
    const y = dbToY(db);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = '#aaa';
    ctx.fillText(`${db}`, w - 2, y - 2);
  }

  // RMS bar
  const rmsY = dbToY(rmsDb);
  const barX = 4;
  const barW = 14;

  // Gradient: green → yellow → red
  const gradient = ctx.createLinearGradient(0, h, 0, 0);
  gradient.addColorStop(0, '#2ecc71');     // bottom: green
  gradient.addColorStop(0.6, '#f5c518');   // middle: yellow
  gradient.addColorStop(0.85, '#e67e22');  // upper: orange
  gradient.addColorStop(1, '#e74c3c');     // top: red

  ctx.fillStyle = gradient;
  ctx.fillRect(barX, rmsY, barW, h - rmsY);

  // Peak indicator line
  if (peakDb > minDb) {
    const peakY = dbToY(peakDb);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(barX, peakY, barW, 2);
  }

  // Peak hold line
  if (peakHold > minDb) {
    const holdY = dbToY(peakHold);
    ctx.fillStyle = peakHold > -3 ? '#e74c3c' : '#1a1a1a';
    ctx.fillRect(barX, holdY, barW, 2);
  }

  // Clip indicator
  if (peakDb > -0.1) {
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(barX, 0, barW, 6);
  }
}
