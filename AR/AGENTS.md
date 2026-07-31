# AR — 폰이 여는 화면 (Vite + 바닐라)

- **React·차트를 넣지 않는다.** 폰이 열고 첫 로딩이 이미 7.5MB다
- **`Dashboard/` 를 import 하지 않는다.** 공유는 `Shared/` 로만
- `#arjs-video` 의 **크기를 CSS 로 건드리지 않는다** — 영상↔투영 대응이 깨져 로봇이 밀린다
- **`body` 에 배경을 주지 않는다.** 배경은 `html` 에만 — 안 그러면 폰에서 검은 화면 (D13)
- `window` 노출(`robot`·`points`·`zone`·`mcfg`…)을 **빼지 않는다.**
  이관 기준값 대조가 거기 걸려 있다 (`docs/evidence/2026-07-30/ar-baseline.md`)
- **판정은 폰이다.** 카메라 권한은 자동화로 못 넘는다 — 빌드 통과로 대체하지 않는다
- 자산은 `Shared/assets` 가 `publicDir` 이라 **루트에서 서빙**된다 → `/FAIRINO_FR5/…`

## 폴더

| 경로 | 무엇 |
|---|---|
| `*.html` | 브라우저 진입점 |
| `src/screens/` | 화면 진입점. js+css 한 쌍 |
| `src/features/marker/` | 마커 인식 기능 |
| `src/external/` | AR.js 를 ESM 으로 미리 구운 벤더 파일(1.5MB). **우리가 고치지 않는다** |
| `test/` | 마커 감지 테스트 화면·이미지 |
| `vite.config.js` | 엔트리·publicDir. `Shared/assets` 가 루트로 서빙된다 |
| `vercel.json` | 배포 설정. **카메라 권한 헤더가 여기 있다** |

읽을 것 — `docs/ref/AR-DEBUG.md` (안 될 때) · `docs/ref/BUILD-VITE.md` (경계)
