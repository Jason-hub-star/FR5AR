# FR5 웹 화면 경계

FR5 조작·티칭·경로 검토·실행 기록은 이 앱에 둔다. `Dashboard/`에는 배치안과 생산성 요약,
FR5 앱으로 가는 연결만 남기고 로봇 명령을 두지 않는다.

예정 구조:

```text
src/
├── features/          조작 · 티칭 · 슬롯 · 경로 · 기록
└── data/datasource/  mock ↔ FR5 bridge ↔ Database 교체 경계
```

Dashboard와 같은 `data-theme="light"` 및 `Shared/tokens/`를 사용한다. 선택·주요 동작은
중립 흑백, 안전 상태만 정상/경고/위험색을 쓴다. 일반 카드는 불투명하고 3D 위 정보판만
`--c-overlay`를 허용한다. 컴포넌트와 Tailwind/shadcn은 codegate에서 복사하지 않는다.
실행 가능한 파일, 패키지, 의존성은 아직 만들지 않았다.
