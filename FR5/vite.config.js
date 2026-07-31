// FR5 번들 — 팀원 노트북·폰이 연다. 빌드 산출물은 fr5-bridge 가 LAN 서빙한다 (API-CONTRACT §왜).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// 계약 경로는 /api 접두어가 없다 (API-CONTRACT). dev 는 경로별로 브리지에 넘긴다.
const BRIDGE = `http://localhost:${process.env.FR5_PORT ?? 5055}`;
const API_PATHS = ['/robots', '/connect', '/version', '/disconnect', '/state', '/owner', '/points', '/preview'];

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
