---
name: 검증
description: 실렌더·동작 검증을 한 입구로 모은 스킬. "브라우저로 확인" "실렌더 검증" "QA 돌려줘" "스크린샷으로 판정" 에 발동. 헤드리스 CDP 단건 검증(기본)과 시나리오 병렬 QA(넓을 때) 둘을 담는다.
user_invocable: true
---

# 검증 — 실렌더로 판정한다

Playwright/Puppeteer 없이 로컬 Chrome을 CDP(Chrome DevTools Protocol)로 직접 몰아 실렌더를 검증한다. 검증은 성역 — "확인 대신 추측" 금지. 이 스킬은 그 확인을 무거운 의존성 없이 가능하게 한다.

## 어느 쪽인가

| | 언제 | 절차 |
|---|---|---|
| **단건 실렌더** (기본) | 화면 하나가 정말 그렇게 뜨나. 3D·AR 변경 후 | 이 문서 |
| **시나리오 병렬 QA** | 화면·기능이 많아 넓게 훑어야 할 때 | `references/병렬-QA.md` |

**FR5Web 주의** — AR 화면은 카메라 권한 때문에 자동 검증이 안 넘어간다.
그 한계와 우회는 `docs/ref/AR-DEBUG.md` §6 이 정본이다. **판정은 폰이다.**

## Use When

- 실행 중인 웹앱을 **눈/동작으로 확인**해야 하는데 Playwright/Puppeteer가 없다.
- 보호 라우트를 스크린샷하려면 **세션 주입**(localStorage `sb-<ref>-auth-token` 등)이 필요하다.
- **멀티탭/멀티계정** 상호작용(예: 실시간 A↔B 송수신)을 재현해야 한다.
- **중첩 iframe** 안의 캔버스/전역(`window.__probe`)을 구동·검증해야 한다.
- 표정/애니메이션 등 **렌더 반응**을 before-after **픽셀 diff**로 판정해야 한다.
- 웹캠 페이지를 가짜 카메라로 **스모크**하고 콘솔에러 0을 확인한다(실얼굴은 안 나옴 — 한계 명시).

## Inputs

- 대상 URL(로컬 dev 서버 권장, 예 `http://localhost:5173/...`) — dev가 떠 있어야 함.
- 필요 시 세션 JSON(supabase-js는 `localStorage['sb-<projectRef>-auth-token']`에 전체 세션 저장).
- 재사용 하네스: `references/cdp-harness.mjs` (의존성 0, Node ≥ 22 전역 WebSocket·fetch + 로컬 Chrome).

## Read First

1. `references/cdp-harness.mjs` — `openPage(url, opts)` / `pixelChanged(a,b)` API.
2. 대상 앱의 라우트·전역 훅(`window.__probe` 등)·세션 저장 키(주입 전 소스에서 실제 키 확인).

## Steps

1. dev 서버가 떠 있는지 확인(`curl -s -o /dev/null -w "%{http_code}" <url>` = 200). 새 정적파일은 서버 재시작 불요, 번들 코드 변경은 HMR/재시작 확인.
2. `cdp-harness.mjs`를 스크래치로 복사하고 짧은 테스트 `.mjs`를 작성 — `openPage` → (세션주입/네비게이트) → `waitFor(준비조건)` → 상호작용/`eval` → `screenshot`/`pixelChanged` → `consoleErrors` 확인 → `close`.
3. 탭·포트를 분리해 멀티계정/멀티탭을 재현(각 `openPage`에 다른 `port`·`userDataDir`).
4. `node test.mjs` 실행. 판정은 **ground truth**로: 상태 텍스트·요소 존재·픽셀 상이·콘솔에러 수를 명시적으로 출력.
5. 스크린샷은 **몽타주 1장 또는 before/after 2장만** Read(중복 금지, 토큰 성역).

## Outputs

- PASS/FAIL 판정 + 근거(상태 텍스트·픽셀 diff·콘솔에러 목록).
- 검증 스크린샷(필요한 최소 장수).
- (선택) 재사용 가능한 테스트 스크립트.

## Verify

- `openPage`가 타깃을 찾음(Chrome 설치/경로 OK). 못 찾으면 에러 메시지에 원인.
- 판정이 추측이 아니라 관측값 기반(텍스트/픽셀/에러 카운트).
- 헤드리스 한계를 정직히 명시: 가짜 카메라는 **실얼굴 트래킹을 검증 못 함** → 파이프라인 도달(TRACKING)·렌더·구동만 검증하고, 실입력 판정은 사람 실기 확인으로 넘긴다.

## Failure / Fallback

- CDP 타깃 못 찾음 → Chrome 경로를 `openPage(url,{chrome:'<path>'})`로 지정; `--user-data-dir` 충돌 시 포트별 프로필 분리.
- WebGL 크로스오리진 텍스처가 검게/tainted → 대상 앱이 `image.crossOrigin="anonymous"`를 설정하고 서버가 CORS를 주는지 확인(하네스 문제 아님).
- 세션 주입 후에도 로그아웃 상태 → 소스에서 실제 저장 키를 재확인(프로젝트 ref·키 포맷). 추측 금지.
- 캐시로 옛 코드가 뜸 → 포트별 `userDataDir`를 삭제하고 재실행.

## Output Template

```text
- Scope:
- URL / Route:
- Interaction:
- Verdict (PASS/FAIL):
- Evidence (state/pixel/console):
- Headless limits noted:
- Next Action:
```

### 함께 보는 것

- `references/병렬-QA.md` — 넓게 훑을 때
- `references/cdp-harness.mjs` — 헤드리스 하네스
- `references/README.md` — 하네스 사용법
