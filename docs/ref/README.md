# ref — 무엇을 어디에 두나

**루트에 문서를 두지 않는다.** 모든 SSOT 문서는 카테고리 폴더 안에 들어간다.
이 README만 루트에 남는다. `scripts/check/docs.sh`가 강제한다 — 루트에 md가 생기면 실패한다.

## 지금 있는 것

```
docs/ref/
├── README.md
├── product/                    무엇을 왜 만드나 — 범위의 근거
│   ├── PRD.md                    목표(배치별 생산성) · 기능 F1~F9 · 완료 판정
│   ├── USER-REQUIREMENTS.md      페르소나 6 · UR 25 · SR 26 · 화면 14
│   └── FEATURE-SPEC.md           F1~F9 의 ID·우선순위·폴더·의존 관계
├── contract/                   서로 맞출 모양 — 어기면 조용히 어긋난다
│   ├── API-CONTRACT.md           REST/WS. 상태·명령·조종권·이동지점·배치안
│   ├── TB-CONTRACT.md            터틀봇 관제 — 상태·teleop·슬롯·맵·기록
│   ├── SHARED-CORE.md            배치안 모델·단위·설정·datasource
│   └── SAFETY-RULES.md           안전 판정 19개 + SDK 필드 매핑 · fail-closed
├── arch/                       어떻게 짜여 있나 — 코드를 쓰기 전에
│   ├── ARCHITECTURE.md           역할 분담 · 확장성 경계 · 폴더 · 좌표계 · UI 토큰
│   ├── STACK.md                  확정 기술과 버전 · 근거 · 함정
│   ├── BUILD-VITE.md             앱↔Shared 경계 · 파일 귀속 · 게이트 경로
│   ├── CODING-CONVENTIONS.md     단위·좌표계·안전·네이밍
│   └── CONSOLE-REACT.md          관제화면(React) 규약 — R3F 금지 · 목업 우선
├── plan/                       무엇부터 하나 — 순서와 완료 조건
│   ├── MILESTONES.md             L1~L3 + H0~V7 단계와 완료 조건
│   ├── FR5-IMPLEMENTATION-PLAN.md  FR5 상세 — 5패널·실기 게이트·슬롯·기록
│   └── SLICE-AR-DEMO.md          AR 실증 슬라이스 5단계 · 정합 오차 실측
├── runbook/                    현장에서 — 안 될 때 제일 먼저 여는 것
│   ├── FR5-BRINGUP.md            로봇 붙이는 5분 순서 · 증상별 조치
│   └── AR-DEBUG.md               화면 진단판 읽는 법 · 증상별 원인 · 자동화 한계
├── rnd/                        착수 전 판단 기록 (수렴 루프) — SSOT 아님
└── unity/                      Unity 유래 발췌 — 웹 기준 아님, 배너 필수
```

## 카테고리

| 폴더 | 담당 | 분류 | 판정 기준 |
|---|---|---|---|
| `product/` | 무엇을 왜 만드나 | SSOT | 범위가 갈릴 때 여기가 이긴다 |
| `contract/` | 두 쪽 이상이 맞춰야 하는 모양 | SSOT | **코드보다 먼저 고친다** (CLAUDE.md 하드룰 1) |
| `arch/` | 구조·기술·규약 | SSOT | 코드를 쓰기 전에 읽는다 |
| `plan/` | 순서와 완료 조건 | SSOT | "다음에 뭘" 의 답 |
| `runbook/` | 현장 절차·증상별 조치 | SSOT | 실기가 안 붙을 때 |
| `rnd/` | 착수 전 수렴 루프 | 조사 | **근거로 쓰지 않는다** |
| `unity/` | Unity 프로젝트 발췌 | 참고 | 웹 기준과 충돌하면 **웹이 이긴다** |

## 어디에 넣을지 헷갈리면

- **두 폴더(앱·브리지)가 같이 봐야 하나?** → `contract/`
- **혼자 보는 규칙인가?** → `arch/`
- **"무엇을 만들지"인가, "어떻게 만들지"인가?** → 앞은 `product/`, 뒤는 `arch/`
- **날짜가 붙나?** → ref가 아니다. 검증이면 `docs/evidence/YYYY-MM-DD/`, 조사면 `docs/research/`

새 문서는 `docs/INDEX.md`에 한 줄 등재한다. 게이트가 필수 문서의 등재를 검사한다.
