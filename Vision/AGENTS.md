# Vision — 손목캠 제안 생산자 · **미착수** (팀원 몫일 수 있다)

**비전은 명령을 만들지 않는다. 제안을 만든다** — 죽으면 아무 일도 안 일어난다(fail-closed).
계약 `ref/contract/VISION-CONTRACT.md` · 경계 `ref/arch/ARCHITECTURE.md` §비전 · 제원 `ref/arch/DEPTH-CAM.md` · 조사(SSOT 아님) `research/vision-imitation.md`.

## 카메라라고 다 Vision 이 아니다 — 여기 것은 셋뿐이다

| 일 | 주인 |
|---|---|
| **D435 스트림 + 객체 검출 · hand-eye 변환(카메라→TCP) · `POST /proposal` 클라이언트** | **여기** |
| 글로벌 카메라(폰) 캘리브레이션 — 내부·외부 파라미터 | `scripts/map/` |
| 배치안 겹쳐 보기 | `AR/src/screens/cam.js` |
| 라이브 PiP · 공간 HUD · 제안 고스트 | `FR5/src/features/live/` |
| `/proposal` 접수 · 판정 3단 · 조종권 · `moveJ` 번역 · 기록 | `FR5/bridge/` |

**상한을 여기서 만들지 않는다** (`SAFETY-RULES.md` §상한 그대로) — 비전용 상한이 곧 게이트 우회로다.

## 문이 열리는 순서 — 뒤집으면 파지 실패가 아니라 충돌이다

지금 짜도 계약이 전부 `toolCalibrationUnverified` 로 되돌린다. **①저울**(카메라+브래킷 질량
미측정) → **②말단 하중 재설정**(질량 + 무게중심 수평 82mm · D69) → **③툴 좌표계 캘리브레이션
검증**. **호스트도 미정**(D61) — 어디서 도는지 정해져야 폴더 안 구조가 정해진다.

## 다시 논의하지 마라

**마지막 구간은 아무것도 안 보인다** — 컬러가 손끝 아래 36mm, 깊이가 2mm 에서 끊긴다(D69).
앵커로 봉인한다. **closed-loop 도 "파지 순간 RGB 만" 도 기각됐다.** `auto` 통과도 닫혀 있다.
