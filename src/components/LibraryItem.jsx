import { useRef, useEffect } from 'react';

export default function LibraryItem({ item, onRemove }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    drawWaveform(canvasRef.current, item.audioBuffer);
  }, [item.audioBuffer]);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('soundId', String(item.id));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className="library-item"
      draggable
      onDragStart={handleDragStart}
    >
      <canvas ref={canvasRef} className="waveform-canvas" width={120} height={32} />
      <span className="library-item-name">{item.name}</span>
      <button className="library-item-remove" onClick={onRemove}>×</button>
    </div>
  );
}

function drawWaveform(canvas, audioBuffer) {
  if (!canvas || !audioBuffer) return;
  const ctx = canvas.getContext('2d');
  const data = audioBuffer.getChannelData(0);
  const width = canvas.width;
  const height = canvas.height;
  const step = Math.ceil(data.length / width);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f0f0f5';
  ctx.fillRect(0, 0, width, height);

  ctx.beginPath();
  ctx.strokeStyle = '#d4a810';
  ctx.lineWidth = 1;

  const mid = height / 2;
  for (let i = 0; i < width; i++) {
    let min = 1, max = -1;
    for (let j = 0; j < step; j++) {
      const idx = i * step + j;
      if (idx < data.length) {
        if (data[idx] < min) min = data[idx];
        if (data[idx] > max) max = data[idx];
      }
    }
    ctx.moveTo(i, mid + min * mid);
    ctx.lineTo(i, mid + max * mid);
  }
  ctx.stroke();
}
