# Canonical Skill Routing

기본 흐름은 아래 순서를 권장한다.

1. `/계획`
2. `/감사`
3. `project-bootstrap`
4. `/계획`
5. `api-contract-guard`
6. `doc-sync`
7. `/회고`

## How To Use

- 계획을 처음 잠글 때: `/계획`
- 범위와 설계 가정이 흔들릴 때: `/감사`
- 새 프로젝트 구조를 만들 때: `project-bootstrap`
- 실제 구현 마일스톤으로 쪼갤 때: `/계획`
- API, schema, env var 계약을 확정할 때: `api-contract-guard`
- 코드와 문서를 함께 닫을 때: `doc-sync`
- 세션 종료 후 재사용 패턴을 남길 때: `/회고`
