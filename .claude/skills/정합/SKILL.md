---
name: 정합
description: 값·용어·결정이 바뀌었을 때 뿌리 SSOT부터 고치고 참조하는 모든 문서·스크립트로 일관되게 전파하는 스킬. 숫자를 정정할 때는 세는 단위까지 함께 전파한다.
user_invocable: true
tags: [domain, propagate, write]
trigger: "'정합', '이 값 바뀌었어', 버전·기준값·필드명·조건 개수가 바뀔 때."
version: 1
---

# /정합 — 뿌리부터 전파

값 하나를 고치고 끝내면 **문서마다 다른 숫자가 남는다.** 뿌리부터 전파한다.

## 절차

### 1. 뿌리 SSOT를 찾는다
| 바뀐 것 | 뿌리 |
|---|---|
| 라이브러리 버전 · SDK 필드 | `docs/ref/STACK.md` |
| API 스키마 · 메시지 | `docs/ref/API-CONTRACT.md` |
| 안전 조건 | `docs/ref/SAFETY-RULES.md` |
| 기능 범위 | `docs/ref/FEATURE-SPEC.md` |
| 단계 완료 조건 | `docs/ref/MILESTONES.md` |
| 구조 · 폴더 | `docs/ref/ARCHITECTURE.md` |

**뿌리를 먼저 고친다.** 사본을 먼저 고치면 어느 쪽이 맞는지 알 수 없게 된다.

### 1-b. 문서를 고칠 필요가 있는 변경인가
*(흡수: `doc-sync`)*

아래만 바뀌었으면 문서 갱신이 불필요할 수 있다.

- 오탈자 · 포맷팅
- 테스트 fixture · 로그 · 생성된 파일
- 주석만 수정

**단, 동작이나 경계가 바뀌면 trivial이 아니다.** 함수 이름, 반환값, 조건 하나가 바뀌어도
계약이 바뀐 것이면 문서를 고친다.

변경 파일 목록부터 본다 (저장소가 있으면):
```bash
git status --porcelain
git diff --name-only HEAD
```

### 2. 참조하는 곳을 전부 찾는다
```bash
grep -rn "<바뀐 값>" docs/ scripts/ --include="*.md" --include="*.sh" | grep -v "\.claude/skills"
```

### 3. 스크립트 기준값도 고친다
`scripts/README.md`의 **기준값 표**를 본다. 어느 스크립트의 어느 상수인지 거기에 정리돼 있다.
**이 문서에 상수 목록을 복제하지 않는다** — 두 곳에 같은 숫자가 있으면 그 자체가 드리프트다.
해당 상수를 안 고치면 **게이트가 거짓으로 실패한다.**

### 4. 개수를 바꿀 때는 세는 단위를 함께 적는다
2026-07-30에 SDK 필드 수를 150→292→150으로 두 번 바꿔 말했다. **둘 다 맞았다** —
150은 구조체 필드, 292는 별칭 포함 추출 건수였다.
단위를 안 밝히면 정정이 또 다른 혼선을 만든다. `AGENTS.md` 규칙 4.

### 5. 결정이 바뀐 것이면 기록한다
`docs/status/DECISION-LOG.md`에 **왜 바꿨는지** + 이전 결정을 기각한 이유.
이전 결정을 지우지 않는다. 덧붙인다.

### 6. 검증
```bash
bash scripts/check/all.sh
```

## 하지 말 것

- 사본만 고치고 뿌리를 안 고치기
- `grep` 없이 "여기만 쓰겠지" 추측
- 스크립트 상수를 잊기 (게이트가 거짓 실패한다)
