# TurtleBot — 터틀봇 관제 (웹앱 · tb-bridge · **P0~P4 완료, 로봇 실주행만 남음**)

**계약이 먼저다** — `docs/ref/TB-CONTRACT.md` 를 고치고 코드를 짠다 (D29~D31).

- 웹앱(:5175)과 브리지(:5055)가 **이 폴더에 수직 완결** — 우분투에서 배포된다.
  Vercel 에 올리지 않는다 (D29)
- **ROS 는 `bridge/ros_adapter/` 안에서만.** mock↔real 파일 교체가 환경 전환의 전부 —
  맥에서 개발하고 우분투에서 실행한다 (D30)
- 화면은 `fetch` 금지 — `src/data/datasource/` 경유. `Dashboard/` 상호 import 금지,
  FR5 `bridge/` 와 무의존 — 로봇마다 관문 하나
- 안전은 브리지가 강제 — 속도 상한 · 워치독 500ms · `estop` 항상 통과. 클라이언트를 믿지 않는다
- 팀원 주행 스크립트는 `bridge/slots/` 에 꽂힌다 — 계약은 `bridge/slots/README.md`

## 폴더

| 경로 | 무엇 |
|---|---|
| `src/screens/` | 엔트리 jsx+css 한 쌍. 탭 3개(주행·매핑·기록), 라우터 없음 |
| `src/data/datasource/` | 출처를 아는 유일한 곳 — 지금 mock.js, P2 에 http.js |
| `src/features/` | drive · mapping · runs · map(캔버스) · logs |
| `bridge/` | FastAPI 관문 — 상태 WS·슬롯 프로세스·맵·live.png·기록·정적 서빙 |
| `bridge/ros_adapter/` | ROS 유일 경계 — mock·real 둘 다 동작 (real 은 D43) |
| `bridge/slots/` | 팀원 파이썬 슬롯 — 계약은 `slots/README.md` |

실행 `bash scripts/dev/tb-dev.sh` · 검증 `node scripts/check/tb-{web,bridge,cycle}-verify.mjs`
읽을 것 — `docs/ref/TB-CONTRACT.md`
