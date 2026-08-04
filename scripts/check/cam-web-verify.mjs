// 글로벌 카메라 겹치기 실렌더 검증 — `AR/cam.html` 을 실제 브라우저로 띄워 판정한다.
//
// **눈으로 "맞는 것 같다" 로 끝내지 않는다.** 사진 속 태그를 cv2 로 다시 검출해 얻은 중심과,
// 화면이 실제로 쓰는 카메라로 실험실 좌표를 투영한 픽셀을 **숫자로 대조**한다
// (evidence/2026-08-02 §S4 와 같은 방법).
//
// 실행: node scripts/check/cam-web-verify.mjs
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openPage } from '../../.claude/skills/검증/references/cdp-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 5188;
const BASE = `http://localhost:${PORT}/cam.html`;
const MAX_PX = 3;          // S4 실측이 0.83px. 여유를 3배 두되 이 이상은 어긋난 것이다

const results = [];
const check = (name, ok, detail = '') => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── 정답 — 합성 사진에서 태그를 **다시 검출**해 중심 픽셀을 얻는다. 참값을 쓰지 않는다.
const truth = JSON.parse(execFileSync('python3', ['-c', `
import json
import cv2, numpy as np
from pathlib import Path
root = Path(${JSON.stringify(ROOT)})
spec = json.loads((root / "Shared/assets/tag/tags.json").read_text(encoding="utf-8"))
dic = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, spec["family"]))
g = cv2.imread(str(root / "AR/test/cam-fixture/shot.png"), cv2.IMREAD_GRAYSCALE)
c, i, _ = cv2.aruco.ArucoDetector(dic, cv2.aruco.DetectorParameters()).detectMarkers(g)
print(json.dumps({int(k): np.mean(q[0], axis=0).tolist() for q, k in zip(c, i.ravel())}))
`], { encoding: 'utf8' }));
check('사진에서 태그 4장 재검출', Object.keys(truth).length === 4, Object.keys(truth).join(','));

const web = spawn('npm', ['run', 'dev', '-w', '@fr5/ar', '--', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore' });
const waitUp = async (url) => {
  for (let i = 0; i < 150; i += 1) {
    if (await fetch(url).then((r) => r.ok).catch(() => false)) return true;
    await new Promise((r) => { setTimeout(r, 200); });
  }
  return false;
};

let p = null;
try {
  if (!await waitUp(BASE)) throw new Error('vite dev 기동 실패');

  // ── 1. 고정물 그대로 (배율 없음)
  p = await openPage(BASE, { port: 9351, windowSize: '1280,900' });
  await p.waitFor('Boolean(globalThis.__cam?.view)');
  const base = await p.eval(`(() => {
    const c = globalThis.__cam;
    return {
      scale: c.view.root.scale.x,
      name: document.getElementById('sceneName').textContent,
      hud: document.getElementById('scale').textContent,
      warn: document.getElementById('status').className,
      slab: c.view.root.getObjectByName('slab')?.visible,
      canvas: document.querySelector('#host canvas')?.width ?? 0,
      bg: c.stage.scene.background,
      px: [[300,300,0],[2700,300,0],[2700,1300,0],[300,1300,0]].map((L) => c.toPixel(L)),
    };
  })()`);
  check('배치안이 파일에서 올라온다 (하드코딩 아님)', base.name === '합성 고정물', base.name);
  check('배율 없으면 1:1', base.scale === 1, base.hud);
  check('바닥 슬래브는 숨긴다 — 영상의 진짜 바닥을 가리지 않는다', base.slab === false);
  check('배경 투명 — 영상이 비친다', base.bg === null);
  check('캔버스가 그려졌다', base.canvas > 0, `${base.canvas}px`);
  check('합성 고정물이라고 경고한다', base.warn.includes('warn'), base.warn);

  // ── 2. 정합 — 태그 lab 좌표를 화면 카메라로 투영한 값 ↔ 사진에서 검출한 중심
  const worst = [0, 1, 2, 3].reduce((mx, i) => {
    const [gx, gy] = base.px[i];
    const [tx, ty] = truth[i];
    return Math.max(mx, Math.hypot(gx - tx, gy - ty));
  }, 0);
  check(`정합 — 스테이션 좌표 ↔ 사진 속 태그 중심 (한계 ${MAX_PX}px)`,
    worst < MAX_PX, `최대 ${worst.toFixed(2)}px`);

  // ── 3. 배율 — 태그 사각형에 맵을 맞춘다 (floor 3000x1600 · fit 1200x800 → 0.40)
  await p.close?.();
  p = await openPage(`${BASE}?fit=1200x800&anchor=500,400`, { port: 9352, windowSize: '1280,900' });
  await p.waitFor('Boolean(globalThis.__cam?.view)');
  const fit = await p.eval(`(() => {
    const c = globalThis.__cam;
    const r = c.view.root;
    return { s: r.scale.x, y: r.scale.y, z: r.scale.z, pos: r.position.toArray(),
             hud: document.getElementById('scale').textContent };
  })()`);
  check('fit 배율이 짧은 쪽으로 잡힌다', Math.abs(fit.s - 0.4) < 1e-9, `${fit.s}`);
  check('균일 스케일 — 로봇이 찌그러지지 않는다', fit.s === fit.y && fit.y === fit.z);
  check('앵커가 planToScene 규약대로 놓인다 (500,400 → x .5 · z -.4)',
    Math.abs(fit.pos[0] - 0.5) < 1e-9 && Math.abs(fit.pos[2] + 0.4) < 1e-9, JSON.stringify(fit.pos));
  check('배율을 화면에 적는다 — 실물 크기가 아님을 말한다',
    /1:2\.5/.test(fit.hud) && /실물 크기 아님/.test(fit.hud), fit.hud);
} catch (e) {
  check('실행', false, e.message);
} finally {
  await p?.close?.();
  web.kill('SIGTERM');
}

const bad = results.filter((r) => !r).length;
console.log(bad ? `\n${bad}건 실패` : `\n${results.length}/${results.length} 통과`);
process.exit(bad ? 1 : 0);
