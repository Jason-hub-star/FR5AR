// FR5 번들 — 팀원 노트북·폰이 연다. 빌드 산출물은 fr5-bridge 가 LAN 서빙한다 (API-CONTRACT §왜).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// 계약 경로는 /api 접두어가 없다 (API-CONTRACT). dev 는 경로별로 브리지에 넘긴다.
const BRIDGE = `http://localhost:${process.env.FR5_PORT ?? 5055}`;
// ⚠ 이 목록은 계약을 **손으로 미러링**한다 — 라우트를 늘리고 여기를 안 고치면 dev 에서만
// 조용히 404 가 난다 (2026-08-05 `/trajectories` 로 실제로 겪었다. 브리지는 200 인데 화면만 거부).
// `scripts/check/consts.sh` 가 이 목록을 main.py 의 라우트와 대조한다 — 손 미러링을 게이트가 받는다
const API_PATHS = ['/robots', '/connect', '/version', '/disconnect', '/state', '/owner',
  '/arm', '/disarm', '/points', '/trajectories', '/slots', '/preview'];

export default defineConfig({
  // 정적 자산은 Shared/assets 하나뿐이다. 복사하지 않는다 (AR 규칙 미러).
  publicDir: resolve(here, '../Shared/assets'),
  plugins: [react()],
  base: './',
  server: {
    host: true,
    port: 5176,             // AR(5173) · Dashboard(5174) · TB(5175) 와 같이 띄울 수 있게
    strictPort: true,       // 조용히 옆 포트로 밀리면 진단이 엉뚱한 서버를 가리킨다 (AR 실측)
    proxy: {
      ...Object.fromEntries(API_PATHS.map((p) => [p, BRIDGE])),
      '/ws': { target: BRIDGE.replace('http', 'ws'), ws: true },
    },
  },
});
