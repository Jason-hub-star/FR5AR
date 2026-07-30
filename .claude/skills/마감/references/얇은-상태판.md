---
name: thin-doc-update
description: Use when the user asks to update docs after work, so status dashboards stay short/current while detailed evidence goes to daily or weekly logs.
user_invocable: true
tags: [docs, status, daily, cleanup, doc-sync]
trigger: "문서 업데이트, doc update, 상태 문서 정리, daily 누적"
version: 1
---

# Thin Doc Update

## Use When

- 사용자가 "문서 업데이트"를 요청한다.
- `PROJECT-STATUS.md`가 긴 작업 로그처럼 쌓이고 있다.
- 해소된 placeholder, 폐기된 실험, 오래된 phase가 상단 상태판에 남아 있다.

## Rules

1. 상태판은 최신 사실만 남긴다.
2. 상세 변경 이력과 증거는 `docs/daily/`에 기록한다.
3. 오래된 daily는 `docs/weekly/`로 압축한다.
4. `Recent Changes`는 5개 이하로 유지한다.
5. 코드/런타임 truth가 문서보다 우선한다.

## Steps

1. Read current status docs:
   - `docs/status/PROJECT-STATUS.md`
   - `docs/status/WORK-BOARD.md` or equivalent, if present
   - `docs/status/MISSING-AND-UNIMPLEMENTED.md` or equivalent, if present
2. Compare with code/runtime facts that changed.
3. Rewrite `PROJECT-STATUS.md` as a thin dashboard:
   - current phase
   - active/pending tracks
   - next actions
   - verification commands
   - recent changes <= 5
4. Move long detail to `docs/daily/YYYY-MM-DD-<slug>.md`.
5. Lower resolved risks with `✅` or move stale detail to weekly/archive.
6. Run doc consistency checks.

## Verify

- [ ] `PROJECT-STATUS.md` can be scanned in one screen or near one screen
- [ ] no duplicated old/current facts conflict
- [ ] detailed evidence exists in daily/weekly when needed
- [ ] doc check command passes or blocker is recorded

## Failure / Fallback

- If no daily folder exists, create a single `docs/daily/YYYY-MM-DD-doc-update.md`.
- If status truth is unclear, inspect code first and mark open questions rather than guessing.
