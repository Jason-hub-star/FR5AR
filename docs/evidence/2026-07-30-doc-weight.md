# 2026-07-30 — 문서 적재 실태와 하네스 이식 판정

분류: **증거**. 두 질문에 답한다 — **무엇이 쌓이나**, **템플릿에서 무엇을 가져오나**.
산출물은 `scripts/check/docs-weight.sh`.

조사 방법 — 적재 실태는 직접 측정. 템플릿(`/Users/family/jason/jason-agent-harness-template`)은
OpenCode 정찰 2건으로 전수 열거하고, **이식 여부가 걸린 파일은 직접 열어 확인했다**
(정찰 요약은 근거가 아니다 — 하드 룰 6).

## 1. 무엇이 쌓이나 (실측)

**측정 시점(2026-07-30, 이 세션의 정리 전)** — 문서 34개 · md 3,405줄 · html 3,059줄.
아래 "측정값" 열은 그때의 값이다. 지금 값은 `docs-weight.sh` 를 돌려 본다.

| 쌓이는 방식 | 대상 | 측정값 | 왜 쌓이나 |
|---|---|---|---|
| **무한 append** | `status/DECISION-LOG.md` | **262줄** (가장 큼) | D1→D17 로 계속 붙는다. archive 로 옮기지 않는 규칙이라 줄지 않는다 |
| 완료 목록 누적 | `status/PROJECT-STATUS.md` | 78줄 | "완료된 것" 이 세션마다 한 줄씩 |
| **1회차 = 1파일** | `evidence/` | 6개 | 세션마다 늘고, 지울 수 없다 (근거다) |
| 1판단 = 1파일 | `ref/rnd/` | 2개 | 결론이 `DECISION-LOG` 로 올라가도 파일은 남는다 |
| 보관 누적 | `archive/` | 2개 | 설계상 늘어난다 |
| **문서 수에 비례** | `INDEX.md` | 32행 / 98줄 | 문서 하나 늘면 한 행. 게이트가 개수를 강제한다 |
| **큰 HTML** | `research/` | **1,884줄** | 이미 `ref/` 로 승격됐다. 읽히지 않는데 남아 있다 |
| 진입 비용 | `CLAUDE.md`+`SESSION-START`+`INDEX` | **226줄** | 매 세션 항상 읽는다 |

**가장 큰 덩어리는 `research/` (html 1,884줄)이지만 읽기 비용에는 안 든다** — 아무도
매 세션 열지 않는다. 반대로 **`DECISION-LOG` 262줄은 실제 비용**이다. 그래서 처방이 다르다.

### 실제로 잡은 것 둘

`docs-weight.sh --weekend` 를 처음 돌려 나온 것이다.

**① 바이트 단위로 같은 파일 두 개** (즉시 처리)

```
docs/research/fr5-cases.html                            53,906B
docs/archive/fr5-cases-share-abandoned-2026-07-30.html  53,906B   md5 17a7343f…
```

`ARCHIVE-INDEX` 의 보관 사유는 "아티팩트용 사본 — 이미지 인라인 중 중단" 이었다.
**인라인이 실행되지 않아 원본을 복사한 상태로 남았다.** 보존되는 정보가 0이고 53.9KB 다.
지우고 `ARCHIVE-INDEX` §지운 것 으로 이관했다.

**② 결론난 조사 문서** (다음 마감 때)

`ref/rnd/NEXT-REFACTOR-2026-07-30.md` — 결론이 D17 로 올라갔고 문서 상단에 배너를 달았다.
그 배너를 스크립트가 읽어 이관 후보로 잡는다.

### 처방 — DECISION-LOG 는 옮기지 않고 목차를 붙였다

`docs/INDEX.md` 가 **"DECISION-LOG 는 archive 로 옮기지 않는다 — 결정의 역사 자체가
정본이다"** 라고 못 박아 뒀다. 그래서 자르는 대신 상단에 **D1~D17 한 줄 목차**를 붙였다.
전문을 통독하지 않고 필요한 D번호만 읽게 된다. 줄수는 늘지만 읽기 비용은 준다.

## 2. 임계값과 출처

`docs-weight.sh` 의 상수다. **경고(soft)는 출력만, 초과(hard)는 exit 1.**

| 대상 | 측정값 | 경고 | 초과 | 출처 |
|---|---|---|---|---|
| `SESSION-START.md` 줄수 | 68 | 80 | 110 | 템플릿 `docs-active-archive` — "maximum 80 lines" |
| `PROJECT-STATUS.md` 줄수 | 78 | 120 | 160 | 템플릿 `document-management` — "80~120줄 목표" |
| 개별 md 줄수 | 262 | 300 | 450 | 템플릿 `CLAUDE.md`·`AGENTS.md` — "300줄 분리 검토" |
| `INDEX.md` 등재 행 | 32 | 45 | 60 | FR5Web 실측 (32에서 시작) |
| `evidence/` 파일 수 | 6 | 15 | 25 | FR5Web 실측 |
| `ref/rnd/` 파일 수 | 2 | 5 | 8 | FR5Web 실측 |
| `docs/**.md` 총 줄수 | 3,405 | 9,000 | 13,000 | FR5Web 실측 |
| 방치 판정 (weekend) | — | 30일 | — | 템플릿은 7일. **우리는 세션 간격이 길어 30일로 늘렸다** |
| 내용 같은 파일 | **1건** | 0 | 1 | 발견 즉시 초과 |
| `DECISION-LOG.md` 줄수 | 320 | 600 | 900 | **전용 상한** — 아래 |
| `DECISION-LOG` 목차 ↔ 결정 개수 | 18 = 18 | — | 불일치 | 드리프트 검사 |

**`DECISION-LOG` 은 일반 상한(300줄)에서 빼고 전용 상한을 줬다.** 320줄로 경고선을 넘었는데,
`docs/INDEX.md` 가 "archive 로 옮기지 않는다" 고 못 박은 문서라 **"절을 잘라 이관하라" 는
처방을 실행할 수 없다.** 조치 불가능한 경고는 소음이고, 소음이 쌓이면 경고를 무시하게 된다.
대신 **상단 목차가 실제 결정 개수와 맞는지**를 잰다 — D19 를 목차 없이 추가하면 exit 1 이다.
일부러 목차 한 줄을 지워 검사가 실제로 실패하는 것을 확인했다.

**템플릿의 7일 방치 경고도 그대로 쓰지 않았다.** 그 값은 매일 도는 프로젝트 기준이고,
우리는 문서 대부분이 며칠 이상 안 바뀌는 게 정상이다. 7일이면 매번 경고가 떠서
경고 자체가 무의미해진다.

## 3. 하네스 이식 판정

템플릿 전수 — **하네스 48개**(+보관 27개는 전부 Vtube 계열) · 패턴 1개 · 스킬 26개 · `.sh` 17개.

### 이미 우리에게 있다 — 가져오지 않는다

| 하네스 | 우리 쪽 구현 |
|---|---|
| `docs-folder-gate` | **`scripts/check/docs.sh`** — docs/ 루트 2개 제한 · 보관 이름 규칙 · ARCHIVE-INDEX 등재. 게이트 3종이 그대로 들어 있다 |
| `session-handoff` · `evidence-review` 등 | 2026-07-29 하네스 이식 때 커맨드 8개로 들어왔다 (D6) |

### 이번에 흡수했다

**`doc-health-audit`** — 스킬 파일을 복사하지 않고 **3대 기준(인덱싱성 / 파일크기·토큰 /
폴더·정리)과 처방(삭제 금지 = 이관만, `git mv`, ARCHIVE-INDEX 등재)만** `docs-weight.sh` 로
구현했다. 스킬은 "저가 모델에 편집 위임" 절차가 본체인데, 우리는 문서 수가 34개라
사람이 직접 고치는 게 싸다.

### 다음에 가져올 값어치가 있다 (순서대로)

| 하네스 | 왜 우리에게 필요한가 | 근거 |
|---|---|---|
| **`secret-scan`** | **레포가 2026-07-30 공개됐고 `.env` 가 있다.** git 추적 파일을 8가지 시크릿 패턴으로 스캔한다. 커밋 직전 게이트 | D14 |
| **`repo-asset-hygiene-gate`** | 고아 자산·죽은 링크 양방향 감사. **`TGALoader.js`(538줄)가 정확히 이 케이스였다** — importmap 에 등록만 되고 아무도 import 하지 않았다. 전수조사로 겨우 찾았는데, 게이트가 있으면 자동으로 잡힌다 | `evidence/2026-07-30-vite-gate.md` §5 |
| `api-contract-guard` | 외부 계약(모델명·필드명)을 코드에 박기 전에 중앙화. **팀원 지표 계약을 곧 다룬다** | `API-CONTRACT.md` §생산성 지표 |

### 가져오지 않는다 — 이유가 있다

| 하네스 | 왜 안 가져오나 |
|---|---|
| `thin-doc-update` · `docs/daily/` → `weekly/` **3단 회전** | **우리는 daily 로그를 쓰지 않는다.** 세션 기록은 `evidence/` 에 주제별로 남긴다. 쓰지 않을 폴더 기계장치를 미리 만들지 않는다 — 그게 바로 이 문서가 막으려는 적재다 |
| `backlog-drift-probe` | 체크박스 백로그 문서가 없다. `MILESTONES.md` 의 AC 는 사람이 검증하고 evidence 로 닫는다 |
| `project-board` (yaml → md+html+png) | 팀 공유는 `README.md` 와 배포 URL 로 이미 된다 |
| `next-vercel-*` · `supabase-slice-verify` · `designlang-*` 등 | 스택이 다르다 |
| 보관된 27개 (`harnesses/archive/`) | 전부 Vtube 도메인 |

## 4. 정찰 방법 메모

OpenCode `handoff` 에이전트 2건을 병렬로 걸어 산출 파일명을 다르게 줬다
(`scout-harness.md` · `scout-scripts.md`). 실행 시간 각 3~4분, 충돌 0.

지시문에 **"하나도 빼지 마라 + 끝나고 개수를 직접 확인해 N/N 을 리포트 첫 줄에 적어라"**
를 박았고, 둘 다 지켰다 (`harnesses 48개 + archive 27개 / patterns 1개 전수 확인`,
`sh 17개 전수 확인`). 자가검증은 시키면 하고 안 시키면 안 한다.

**이식 판단이 걸린 파일 5개는 직접 열어 확인했다** — `docs/ops/document-management.md`,
`doc-health-audit/SKILL.md`, `docs-active-archive/SKILL.md`, `thin-doc-update/SKILL.md`,
그리고 스킬 목록. 정찰이 "daily→weekly 3단 회전" 을 권장 항목으로 올렸지만, 원문을 읽고
**우리가 daily 로그를 쓰지 않는다는 이유로 기각**했다. 요약만 봤으면 그대로 넣었을 것이다.

## 5. 재현

```bash
bash scripts/check/docs-weight.sh            # daily (게이트가 매번 부른다)
bash scripts/check/docs-weight.sh --weekend  # 중복·방치·빈 문서·이관 후보까지
```
