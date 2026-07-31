// 관제화면 번들 — PC 가 연다. **ar-threex(1.6MB)·카메라를 넣지 않는다** (BUILD-VITE.md).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // 자산은 Shared/assets 하나뿐이다. 양쪽에 복사하지 않는다.
  // 대시보드도 URDF 를 쓴다 — 배치안에서 팔을 세우고 도달 범위를 본다.
  publicDir: resolve(here, '../Shared/assets'),
  server: { port: 5174 },   // AR(5173) 과 같이 띄울 수 있게
});
