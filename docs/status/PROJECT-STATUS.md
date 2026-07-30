# PROJECT-STATUS — 현재 상태

**AR 겹쳐 보기 화면이 코드로 서 있다. 남은 것은 폰 실기 확인.**  
갱신일: 2026-07-30

## 지금 단계

첫 슬라이스(AR 겹쳐 보기) A트랙의 코드가 섰다. 로봇·그리퍼·궤적·안전 범위가
브라우저에서 확인됐고 Vercel에 배포됐다. **남은 것은 폰에서 실제 마커를 비추는 확인 하나**다.
만들 주제(무대)의 최종 확정은 여전히 팀 회의에 걸려 있지만, 이 슬라이스는 주제와 무관하다.

## 완료된 것

- 사전 조사 3건 (아이디어 10개 / FR5 사례 80여개 중 58개 검증 / AR 기술 스택)
- 산출 HTML 3개: `docs/ideas.html`, `docs/fr5-cases.html`, `docs/ar-stack.html`
- URDF 웹 실렌더 검증 통과 (2026-07-29)
- 하네스 이식
- SSOT 문서 7개 작성
- **AR 마커 재설계** (2026-07-30) — 바코드 3×3 Hamming #5. 인쇄 시트 A4 150mm · A3 200mm.
  생성기가 자기 출력을 픽셀로 검사한다 (`scripts/assets/make-marker-sheet.py`)
- **마커 검출 실측** (2026-07-30) — 실제 ARToolKit으로 103장. **크기가 아니라 대비가 결정한다**.
  음성 대조군 9건 정상 거부 (`evidence/2026-07-30-marker-detect.md`)
- **그리퍼 장착값 확정** (2026-07-30) — 플랜지 간격 0.00mm. 단위가 팔과 달라 mm→m 보정 필수
  (`evidence/2026-07-30-gripper-mount.md`)
- **웹 화면 3개** — `web/ar.html`(AR) · `web/robot.html`(3D·정합) · `web/test/marker-detect.html`(검증)
- **공유 모듈 3개** — `robot-view.js`(URDF+그리퍼) · `ar-marker.js`(AR.js) · `trajectory.js`(FK 궤적)
- **Vercel 배포** — `web-reylgnies-kimjuyoung1127s-projects.vercel.app`
  (**로그인 벽 때문에 아직 팀원이 못 연다** — 아래 블로커)

## 미착수

- `server/` 브리지 서버 코드 없음
- 그리퍼 손가락 개폐 (prismatic 관절) — 데모 범위 밖. 벌어진 채로 고정
- URDF 확장 (그리퍼를 코드가 아니라 URDF에 넣기) — 장착값은 이미 실측해 뒀다
- (완료 2026-07-29) URDF+STL과 그리퍼 메시를 `web/assets/`로 복사 — 팔 58,482 + 그리퍼 70,102 = 128,584 삼각형

## 다음 한 걸음

1. **Vercel 로그인 벽 해제** — Settings → Deployment Protection → Vercel Authentication 끄기.
   이게 풀리기 전엔 폰 확인이 불가능하다
2. **마커 인쇄 후 폰 확인** — A트랙 1·2단계. 100% 배율·무광·평평하게.
   실측값을 `web/config/marker-offset.json`의 `markerSizeMm`에 넣는다
3. 팀 회의에서 무대 확정 (작은 공장 부품검사·분류가 1순위 후보)
4. B트랙 — 정합 오차 실측 (거리 4단계 × 각도 2종). `evidence/2026-07-30-ar-marker-accuracy.md`
5. 브리지 서버 뼈대: `GET /state` 하나만 먼저 (Mock 모드)

## 블로커

- **Vercel 로그인 벽** — 배포는 됐지만 팀 계정 로그인을 요구한다. 대시보드에서 한 번 끄면 된다
- 무대 미확정 — 시연 시나리오를 못 씀
- Fairino 파이썬 SDK 설치 경로 미확인 (PyPI 없음)

## 하네스 이식 결과

2026-07-29 완료. 출처: `/Users/family/jason/jason-agent-harness-template`.

| 항목 | 내용 | 개수 |
|---|---|---|
| 슬래시 커맨드 | bootstrap-project, doc-update, evidence-review, handoff, impact-map, intake, profile-recommend, self-review | 8 |
| 스킬 | 전용 9개(검진, 다음, 마감, 명령어, 상태, 스택가드, 슬라이스, 정합, 진단) + 템플릿 12개 | 18 |
| 훅 | self-review-gate.sh, doc-drift-reminder.sh, CLAUDE.md(훅 설명) | 3 |
| 스크립트 | check-harness.sh, check-doc-consistency.sh | 2 |
