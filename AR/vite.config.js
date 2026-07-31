// AR 번들 — 폰이 연다. **React·차트를 넣지 않는다** (BUILD-VITE.md §최상위 셋).
import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync, mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const DIAG_DIR = resolve(here, '../.diag');

/**
 * 폰이 보내는 진단 수치를 파일로 받는다 — `.diag/<날짜>.jsonl`
 *
 * **폰에는 콘솔이 없다** (AR-DEBUG.md §원칙). 그래서 지금까지 화면의 숫자를
 * 눈으로 읽어 옮겨 적는 수밖에 없었다. 그 손대는 구간에서 값이 틀어진다.
 *
 * `apply: 'serve'` 라 **배포 빌드에는 존재하지 않는다.** 보내는 쪽도
 * `import.meta.env.DEV` 로 감싸서 프로덕션 번들에서는 통째로 사라진다.
 * 그래서 이 구멍이 운영에 열릴 일이 없다.
 */
function diagSink() {
  return {
    name: 'fr5-diag-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__diag', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c) => {
          body += c;
          if (body.length > 1e6) req.destroy();   // 흘러넘치는 요청은 끊는다
        });
        req.on('end', () => {
          try {
            mkdirSync(DIAG_DIR, { recursive: true });
            const day = new Date().toISOString().slice(0, 10);
            appendFileSync(resolve(DIAG_DIR, `${day}.jsonl`), `${body.trim()}\n`);
          } catch (e) {
            server.config.logger.warn(`[diag] 기록 실패: ${e.message}`);
          }
          res.statusCode = 204;
          res.end();
        });
      });
      server.config.logger.info(`  ➜  진단 로그:  .diag/<날짜>.jsonl  (?log=1 로 켠다)`);
    },
  };
}

export default defineConfig({
  // 정적 자산은 Shared/assets 하나뿐이다. 양쪽에 복사하지 않는다.
  publicDir: resolve(here, '../Shared/assets'),
  plugins: [diagSink()],
  build: {
    rollupOptions: {
      // 화면마다 엔트리가 따로다. 랜딩(index)은 JS 가 없다.
      input: {
        index: resolve(here, 'index.html'),
        ar: resolve(here, 'ar.html'),
        robot: resolve(here, 'robot.html'),
        markertest: resolve(here, 'test/marker-detect.html'),
      },
    },
  },
  server: {
    host: true,             // 폰에서 로컬 확인할 때 필요하다
    // **포트를 고정하고 밀리면 실패시킨다.** 기본 5173 은 다른 프로젝트와 자주 부딪히는데,
    // Vite 는 조용히 다음 포트로 옮겨간다. 그러면 `adb reverse` 도 진단 로그도
    // 엉뚱한 서버를 가리키고 — 실제로 남의 dev 서버에 POST 해서 404 를 받았다.
    port: 5173,
    strictPort: true,
  },
});
