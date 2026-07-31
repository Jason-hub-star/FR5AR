// 2D 맵 캔버스 — 벽·장애물·로봇·궤적을 그린다. three.js 를 쓰지 않는다 (평면이면 충분).
// 좌표는 전부 mm (TB-CONTRACT §단위) — 픽셀 변환은 이 파일 안에서만 한다.
import { useEffect, useRef } from 'react';

const W = 960, H = 640, PAD = 24;

export function MapView({ geometry, robots, paths = [], caption }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const scale = Math.min((W - PAD * 2) / geometry.widthMm, (H - PAD * 2) / geometry.heightMm);
    const px = (xMm) => PAD + xMm * scale;
    const py = (yMm) => H - PAD - yMm * scale;   // 화면 y 는 아래로 자라므로 뒤집는다

    const css = getComputedStyle(canvas);
    const color = (name, fallback) => css.getPropertyValue(name).trim() || fallback;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = color('--c-sunken', '#f4f3f1');
    ctx.fillRect(0, 0, W, H);

    // 벽
    ctx.strokeStyle = color('--c-fg-mute', '#6b6b6b');
    ctx.lineWidth = 5;
    ctx.lineCap = 'square';
    for (const [x1, y1, x2, y2] of geometry.walls) {
      ctx.beginPath(); ctx.moveTo(px(x1), py(y1)); ctx.lineTo(px(x2), py(y2)); ctx.stroke();
    }
    // 장애물
    ctx.fillStyle = color('--c-line', '#e4e2df');
    ctx.strokeStyle = color('--c-line-strong', '#c6c6c6');
    ctx.lineWidth = 1;
    for (const o of geometry.obstacles) {
      const x = px(o.xMm), y = py(o.yMm + o.hMm);
      ctx.fillRect(x, y, o.wMm * scale, o.hMm * scale);
      ctx.strokeRect(x, y, o.wMm * scale, o.hMm * scale);
    }
    // 궤적 (실측 = 실색 — 트윈 두 층 규칙)
    ctx.strokeStyle = color('--c-path', '#2f7d32');
    ctx.lineWidth = 2;
    for (const path of paths) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(px(path[0][0]), py(path[0][1]));
      for (const [x, y] of path.slice(1)) ctx.lineTo(px(x), py(y));
      ctx.stroke();
    }
    // 로봇 — 삼각형 + 이름
    for (const [id, r] of Object.entries(robots ?? {})) {
      const { xMm, yMm, thetaDeg } = r.pose;
      const th = (thetaDeg * Math.PI) / 180;
      const cx = px(xMm), cy = py(yMm), size = 11;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-th);   // 화면 y 뒤집힘에 맞춰 회전도 뒤집는다
      ctx.fillStyle = r.mode === 'idle' ? color('--c-info', '#1f5f9e') : color('--c-ok', '#2f7d32');
      ctx.beginPath();
      ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, size * 0.6); ctx.lineTo(-size * 0.7, -size * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = color('--c-fg', '#1a1c1b');
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(id, cx + 14, cy - 8);
    }
  }, [geometry, robots, paths]);

  return (
    <div className="mapview">
      {caption && <p className="mapview-caption">{caption}</p>}
      <canvas ref={canvasRef} width={W} height={H} />
    </div>
  );
}
