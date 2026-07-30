---
name: 상태
description: FR5Web 현재 상태를 한눈에 스냅샷하고 다음 액션 1개를 추천하는 읽기 전용 브리핑. "지금 어디까지 됐어", "다음 뭐 하면 돼" 트리거. 아무것도 고치지 않는다.
user_invocable: true
tags: [meta, status, read-only]
trigger: "'상태', '지금 어디까지', '다음 뭐 하면 돼', 세션 시작 시."
version: 1
---

# /상태 — 읽기 전용 브리핑

**아무 파일도 고치지 않는다.** 읽고 요약만 한다.

## 읽을 것 (이 순서, 이것만)

1. `docs/status/PROJECT-STATUS.md` — 완료·미착수·다음 걸음·블로커
2. `docs/status/GAP-MATRIX.md` — OPEN 항목만 (CLOSED는 건너뛴다)
3. `docs/ref/MILESTONES.md` — 지금 어느 단계(V0~V4)인가
4. `git log --oneline -5` (저장소가 있으면)

백로그·조사 문서·evidence·HTML은 **읽지 않는다.**

## 실행할 것

```bash
bash scripts/check/all.sh    # 게이트 3종 — 통과 여부만 본다
```

## 보고 형식 (5줄 이내)

- **단계** — V0~V4 중 어디, 그 단계 완료 조건이 무엇인가
- **게이트** — 통과 / 실패(어느 것)
- **막힌 것** — GAP-MATRIX의 OPEN 중 가장 앞을 막는 하나
- **다음 액션 1개** — 지금 당장 할 수 있는 것 하나만. 여러 개 나열 금지
- **주의** — 아직 `git` 저장소가 아니면 반드시 알린다

## 하지 말 것

- 파일 수정
- "다음 액션" 3개 이상 나열 (하나만 고른다)
- 게이트를 안 돌리고 상태를 추측
