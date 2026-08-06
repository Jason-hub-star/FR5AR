// 터틀봇 관제 번들 — 팀원 폰·노트북이 연다. 3D·URDF 를 넣지 않는다 (2D 캔버스뿐이다).
// 빌드 산출물은 tb-bridge 가 정적 서빙한다 (TB-CONTRACT.md §왜) — base 를 상대로 둔다.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5175,             // AR(5173) · Dashboard(5174) 와 같이 띄울 수 있게
    // dev 전용 — http.js 는 상대경로만 알고, 운영은 브리지가 같은 출처에서 서빙한다 (D29)
    // 5056 은 bridge/config.yaml 의 사본이다 (정본은 거기 · D80) — check/consts.sh 가 일치를 잡는다
    proxy: {
      '/api': 'http://localhost:5056',
      '/ws': { target: 'ws://localhost:5056', ws: true },
    },
  },
});
