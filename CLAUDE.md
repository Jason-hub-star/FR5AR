# FR5Web — 진입 문서

FAIRINO FR5 협동로봇을 **브라우저에서 팀 전체가 함께 다루는** 웹 작업대. 폰으로 실물 위에 예정 경로·안전 범위를 겹쳐 본다.

## 5분 진입 순서

1. `docs/SESSION-START.md` — 세션 캡슐. 이것만 읽고 필요한 SSOT를 찾아간다
2. `docs/status/PROJECT-STATUS.md` — 지금 어디까지 됐나
3. `docs/status/DECISION-LOG.md` — 왜 그렇게 정했나
4. 작업 도메인 문서만 추가로 로드 (아래 표)

**백로그·조사 문서·evidence는 사전 로드하지 않는다.** 필요할 때 검색한다.

## 어디를 고칠 때 무엇을 읽나

| 작업 | 먼저 읽을 것 |
|---|---|
| FR5 브리지 (Python) | `docs/ref/contract/API-CONTRACT.md` → `docs/ref/arch/ARCHITECTURE.md` |
| FR5 웹 조작 화면 | `FR5/AGENTS.md` → `docs/ref/contract/API-CONTRACT.md` |
| 배치·지표 관제화면 | `docs/ref/arch/CONSOLE-REACT.md` → `docs/ref/contract/SHARED-CORE.md` |
| AR 겹쳐 보기 | `docs/ref/arch/AR-MARKER.md` → `docs/evidence/` |
| 로봇 실기 | `docs/ref/arch/ARCHITECTURE.md` §로봇 |
| 무엇을 만들지 | `docs/ref/product/PRD.md` |
| 문서를 새로 만들 때 | `docs/ref/README.md` — 어느 카테고리 폴더인지 |

## 하드 룰

1. **구조 변경은 문서가 먼저.** 새 최상위 폴더·새 엔드포인트·새 WebSocket 메시지는 `docs/ref/contract/API-CONTRACT.md`를 먼저 고친 뒤 코드를 짠다. 코드가 앞서면 다음 세션이 계약을 못 찾는다.
2. **검증은 실렌더로.** "될 것이다"로 끝내지 않는다. 3D·AR 변경은 브라우저를 띄워 눈으로 확인하고 `docs/evidence/`에 날짜별로 남긴다.
3. **로봇에 실제 명령을 보내는 코드는 속도 상한과 확인 단계를 반드시 거친다.** 기본 상한 10%, 사람 확인 없이 큰 동작 금지.
4. **명령 주인은 한 명.** 웹·펜던트·CLI가 동시에 움직임 명령을 보내면 충돌한다. 조종권 규칙을 우회하지 않는다.
5. **단위 변환은 한 곳에서만.** URDF는 미터·라디안, 우리 저장 지점은 밀리미터·도(°). 변환 함수를 여기저기 만들지 않는다.
6. **모르면 원본을 연다.** 조사 요약·에이전트 리포트는 근거가 아니다. 설계·근본원인이 걸린 파일은 직접 읽는다.

## 검증 명령

```bash
bash scripts/check/all.sh              # 게이트 전부 (하나라도 실패하면 exit 1)
bash scripts/dev/serve.sh              # AR 로컬 확인 (Vite dev)
npm install                            # 처음 한 번 (workspaces)
node scripts/build/config.mjs          # .env → Shared/data/config/*.json
```

## 슬래시 명령

| 명령 | 하는 일 |
|---|---|
| `/상태` | 현재 상태 + 다음 액션 1개 (읽기만) |
| `/다음` | 바로 다음 항목을 구현 |
| `/진단` | 증상 → 근본 원인 → 최소 수정 |
| `/마감` | 게이트 → 문서 → 핸드오프 |
| `/명령어` | 전체 표 |
| `/슬라이스` | 수직 기능 1개 완결 (V0~V4 한 단계) |
| `/스택가드` | 버전·SDK 필드명을 박기 전 등재 강제 |
| `/검진` | 문서 무결성 린트 |
| `/정합` | 값이 바뀌면 SSOT부터 전파 |

`check/`는 하네스·문서·자산 세 게이트로 나뉜다. 스크립트는 전부 카테고리 폴더 안에 두고,
루트에 두지 않는다. 규약과 기준값 위치는 `scripts/README.md`.

## 지금 상태

착수 전 세팅 단계. 기술 스택 확정·검증 완료, 주제 최종 확정은 팀 회의 대기.
자세한 것은 `docs/status/PROJECT-STATUS.md`.
