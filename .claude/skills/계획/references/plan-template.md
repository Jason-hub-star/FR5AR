# Project Planning Template

이 템플릿은 `scaffold/project-root/docs/ref/PROJECT-PLAN.md`와 같은 구조를 가진다.

```markdown
# <Project Name> Project Plan

## Project Snapshot

- Project: `<name>`
- One-line objective: `<user-visible outcome>`
- Primary users: `<who>`
- Stack: `<frontend / backend / storage / deploy>`
- Repo boundary: `<apps / src / backend / workers>`

## Problem

- ...

## Goal

- ...

## Non-Goals

- ...

## Constraints

- ...

## Assumptions

- ...

## Risks

- ...

## Dependencies

- ...

## Success Metrics

- ...

## Naming Contract

- entity: `...`
- route: `...`
- table/schema: `...`
- env: `...`
- banned names: `...`

## File Map

- create: `candidate:apps/...`
- modify: `docs/ref/product/PRD.md`
- keep: `docs/status/PROJECT-STATUS.md`

## Folder Boundaries

- `src/`: ...
- `apps/`: ...
- `backend/`: ...

## Skill Routing

- planning kickoff: `/계획`
- scope challenge: `/감사`
- implementation orchestration: `/계획`
- contract safety: `api-contract-guard`
- document closure: `doc-sync`
- session close: `/회고`

## Phase Plan

### Phase 0 — Discovery / Validation

Goal:
- ...

Files:
- `docs/ref/product/PRD.md`

Skills:
- `/계획`

Verification:
- `bash scripts/check-project.sh`

Doc Sync:
- `docs/status/PROJECT-STATUS.md`

Exit Criteria:
- ...

Decision Gates:
- ...

## Open Questions

- ...

## Later Backlog

- ...

## Handoff Notes

- ...
```
