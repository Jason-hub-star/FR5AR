# FR5 bridge 경계

FAIRINO FR5의 유일한 명령 관문이다. 계약은 `docs/ref/API-CONTRACT.md`가 정본이다.

구현됨 (P0~P2 · 2026-07-31):

- robot profile 선택(`config.yaml`)과 observe-only preflight — 불일치는 `FAIL_CLOSED` + 사유
- `/robots` `/connect` `/version` `/disconnect` `/state` `/ws/state` (33ms 브로드캐스트)
- 조종권 한 명(`/owner/*` · hello 신원, 409) · `/arm`(`confirm:"현장확인"` 강제) · `/disarm`
- guarded jog/moveJ — SAFETY-RULES 게이트(속도 10%·관절 5°·URDF 한계·신선도·드리프트) ·
  **stop 은 신원·조종권 무관 항상 통과** · owner 소실 = 자동 disarm
- `robot_adapter/` — mock 과 **fairino(검증된 libfairino.dll + Unity Mono 서브프로세스, D41)**.
  실기 observe-only E2E 통과 (`docs/evidence/2026-07-31/fr5-cs-adapter.md`)
- 빌드된 웹(`FR5/dist`)을 같은 주소에서 LAN 서빙 — 주소를 여는 누구나 조작 후보 (팀 신뢰)
- 실행 `bash scripts/dev/fr5-dev.sh` (실기: `FAIRINO_DLL=<libfairino.dll 경로>` 필요) ·
  검증 `node scripts/check/fr5-{bridge,web}-verify.mjs`

예정 책임:

- 실기 arm·jog 현장 체크리스트 승격 (하드룰 3 — 사람 확인)
- Vision은 명령 대신 `POST /proposal`을 보내며 안전 게이트 통과분만 실행
- 지점·경로·슬롯·실행 기록의 API 경계 (P3~)

`robot_adapter/` 밖에서 FAIRINO SDK를 직접 부르지 않는다. 실기 경로는 Python SDK 가 아니라
**검증된 C# SDK 서브프로세스**다 (D41 — dll 은 .NET Framework 전용이라 Unity Mono 로 돌린다).
Python SDK 가 Linux 브리지에서 검증되면 어댑터만 교체한다 — 계약·웹은 모른다.
