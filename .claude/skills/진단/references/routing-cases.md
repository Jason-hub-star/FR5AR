# Routing Cases

## Good

- “새 프로젝트를 시작할 건데 stack도 아직 안 정했다” -> `plan` + `/계획`
- “schema 이름 바꿔야 하는데 어디까지 영향 가는지 보자” -> `/정합` + `/정합`
- “PR 리뷰만 해줘” -> `review` + `/마감`
- “세 폴더를 병렬로 조사해줘” -> `subagent-needed` + `/정합`

## Bad

- 계획이 없는 큰 요청을 바로 `implement`로 보내기
- cross-cutting 변경인데 `/정합` 없이 시작하기
- 로그 triage 정도인데 강한 모델 서브에이전트를 먼저 할당하기
