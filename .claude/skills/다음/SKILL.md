---
name: 다음
description: 추천 말고 바로 다음 항목을 구현하는 실행 커맨드. GAP-MATRIX의 OPEN과 MILESTONES의 현재 단계를 소스로 최소구현→검증→기록까지 한 바퀴 돈다.
user_invocable: true
tags: [meta, execute, write]
trigger: "'다음', '다음 거 해', '이어서 진행'."
version: 1
---

# /다음 — 바로 구현한다

`/상태`는 추천만 한다. 이건 **실제로 만든다.**

## 소스 (이 순서로 고른다)

1. `docs/status/GAP-MATRIX.md`의 **OPEN** 중 현재 단계를 막는 것
2. `docs/ref/MILESTONES.md`의 현재 단계 완료 조건 중 미충족 항목
3. `docs/status/PROJECT-STATUS.md`의 "다음 한 걸음" 1번

## 절차

1. **하나만 고른다.** 여러 개 손대지 않는다.
2. **문서가 먼저인지 확인** — 구조·API 계약·스택 변경이면 `docs/ref/`를 먼저 고친다
   (`CLAUDE.md` 하드 룰 1). 코드가 앞서면 다음 세션이 계약을 못 찾는다.
3. **최소 구현.** 안 시킨 추상화·새 의존성 금지.
4. **검증** — 아래 중 해당하는 것을 실제로 돌린다.
   - 3D·AR 변경 → 브라우저 실렌더 + `docs/evidence/YYYY-MM-DD-*.md` 기록
   - 서버 변경 → 요청 실제로 보내 응답 확인
   - 문서·자산 변경 → `bash scripts/check/all.sh`
5. **기록** — GAP-MATRIX 해당 행을 CLOSED로, PROJECT-STATUS 갱신.
6. **커밋은 별도 승인.**

## 로봇에 명령을 보내는 코드라면

`docs/ref/SAFETY-RULES.md`를 먼저 읽는다. **fail-closed** — 값을 못 읽으면 차단이 기본값이다.
속도 상한 10%, 관절 변화 5° 상한을 서버에서 강제한다. 클라이언트를 믿지 않는다.

## 하지 말 것

- 여러 항목 동시 착수
- 검증 없이 완료 선언
- 무대(배경)가 필요한 항목을 미확정 상태에서 시작 — V1까지는 무대 무관이다
