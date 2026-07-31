# FR5 P2 — 조종권·arm·guarded jog/stop 검증 (mock 전 사이클 + 실렌더)

분류: **증거**. P2 를 mock 으로 닫았다. 실기 명령은 보내지 않았다 (경로 검증은
[[fr5-cs-adapter]] → `docs/evidence/2026-07-31/fr5-cs-adapter.md`).

## 어떻게 쟀나

- `node scripts/check/fr5-bridge-verify.mjs` — **33/33 PASS**. REST + WS 클라이언트 3개(kim·lee·무신원)
- `node scripts/check/fr5-web-verify.mjs` — **21/21 PASS**. 헤드리스 Chrome 실렌더 + 스크린샷 육안

## 판정 내역 (SAFETY-RULES 대비)

| 규칙 | 확인된 것 |
|---|---|
| 명령 주인 한 명 | claim kim → lee claim **409** · lee jog → "조종권이 없다" 회신 |
| 승격은 사람이 명시 | `confirm:"현장확인"` 없는 arm **403** · 조종권 없는 arm **403** · UI 는 체크박스 전 ARM 비활성 |
| arm 시퀀스 | 서보 ON → sample 33ms → ExitDragTeach → auto — 성공 시 `ARMED`, 화면 서보 ON |
| 상한은 거부 (자르지 않음) | jog 10° → "5° 상한" 거부 · moveJ speed 50 → "속도 상한" 거부 |
| 실이동 | jog +2° → mock 이 속도 비례 보간으로 정확히 목표 도달, 이동 중 `EXECUTING`, 큐 소진 |
| stop 은 항상 통과 | **hello 없는 소켓**의 stop 이 이동을 즉시 세움 (관절 정지·큐 0·목표 미도달 확인) |
| 주인 없는 ARMED 금지 | owner release → 자동 disarm (서보 OFF · OBSERVE_ONLY 복귀) |
| UI | 상시 안전 바에 STOP 버튼 · jog +1° 가 표·3D에 정확히 +1° 반영 (`fr5-live-p2.png` 육안) |

## 배포 형태

`npm run build:fr5` 산출물을 브리지가 같은 주소(`:5055`)에서 서빙한다 — dist 서빙·URDF 자산
포함을 실측 확인. **주소를 여는 사람 누구나 조작 후보다** (LAN·팀 신뢰, TB 규칙 미러).
보호는 로그인이 아니라 조종권 1명·서버 게이트·stop 상시가 맡는다.

## 확인하지 않은 범위

- 실기 arm·jog — 현장 확인 후. 절차: `FAIRINO_DLL=<dll경로> bash scripts/dev/fr5-dev.sh` →
  폰/노트북에서 접속 → 이름 → 조종권 → 현장확인 체크 → ARM → jog ±1°. STOP 은 항상 화면 우상단
- 조건 12 의 작업영역(워크스페이스) 정의 — 지금은 URDF 관절 한계만. 데카르트 영역은 미정
