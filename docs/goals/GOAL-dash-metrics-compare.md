# GOAL-dash-metrics-compare — "A가 B보다 몇 % 낫다"가 화면에서 나온다

사다리 3/4. 앞: [GOAL-dash-cycle-player.md](GOAL-dash-cycle-player.md) ·
다음: [GOAL-dash-motion-compare.md](GOAL-dash-motion-compare.md).
**MILESTONES L3(F8) 그 자체다.** 지금 `MetricsCompare.jsx` 는 21줄짜리 "미착수" 문구다.

PRD 성공 판정의 **앞 문장**이 이 골에서 닫힌다 — *"배치안 두 개를 만들어 관제화면에서
생산성 지표를 비교하고 몇 % 낫다를 근거와 함께 말한다."*

## 골 한 줄

```
배치안 두 개의 지표가 나란히 서고 차이가 % 로 한 문장에 나온다
verified by 목업 2개 실렌더 + 선택 필드를 지운 판 + `bash scripts/check/all.sh` + `npm run build:dash`
while preserving 사다리 1~2 검증 green 과 지표 무계산 원칙.
details in docs/goals/GOAL-dash-metrics-compare.md
```

## 1. Outcome (= MILESTONES L3 의 AC)

1. **목업 두 개로 비교 화면이 동작하고 "A가 B보다 몇 % 낫다"가 화면에 나온다**
2. 출처(`mock`/`sim`/`measured`)가 화면에 표시된다 (SR_24)
3. **선택 지표 필드를 지워도 그 칸만 비고 화면이 안 죽는다** (SR_25) —
   `amrTravelMm` · `waitSec` · `interferences` 를 뺀 판으로 확인한다
4. 목업→실물 교체가 `Shared/data/datasource/` **파일 한 개**로 끝난다 (SR_26) —
   **사다리 1이 이미 닫아 둔다.** 여기서는 회귀만 확인
5. 사이클 타임은 `mean` 만 있어도 서고, `p50`·`p95` 가 오면 같이 보인다
6. **차트 라이브러리를 넣지 않는다** — 막대·꺾은선은 SVG 로 직접 그린다 (의존성 0)

## 2. Verification surface

```bash
grep -rn "recharts\|chart.js\|d3" Dashboard/ --include=package.json   # → 0건
bash scripts/check/all.sh
npm run build:dash
```

아티팩트 — `docs/evidence/` 에 **세 장**: ①A·B 나란히 + % 문장 ②선택 필드를 지운 판
(빈 칸이 "—" 이고 화면이 산다) ③출처 배지가 `mock` 인 것.

## 3. Constraints (후퇴 금지)

- 사다리 1·2 의 §2 검증이 계속 green
- **지표를 우리가 계산하지 않는다** — 유일한 예외는 **비교 산술**(A 대 B 의 %)이다.
  처리량·사이클타임 자체를 우리가 만들면 그 순간 측정이 아니라 창작이 된다
  (`ARCHITECTURE.md` §우리 몫)
- 화면이 `fetch` 를 모른다 · 새 의존성 0 · 상태관리 라이브러리 0

## 4. Boundaries

- 허용 — `Dashboard/src/features/metrics/**` · `Dashboard/src/screens/main.css` ·
  `Shared/data/datasource/mock.js`(목업 값) · `docs/evidence/**`
- 금지 — `Shared/data/layout/**` · `Shared/view3d/**` · `FR5/**` · `TurtleBot/**` · `AR/**`

## 5. 미니멀 사다리 적용 기록

① 필요한가 — 그렇다. PRD 성공 판정 앞 문장이 여기서만 닫힌다
② 이미 있나 — 목업 데이터는 사다리 1이 만들어 둔다. 화면은 없다
③④ SVG 는 네이티브다. 막대 두 개와 숫자 몇 개에 차트 라이브러리를 넣지 않는다
⑦ 파일 1개 교체(`MetricsCompare.jsx` 21줄 → 본체)

**천장(ceiling)** — 값이 **목업 두 개**다. 실물은 팀원 회신 4개
(`LAYOUT-METRICS-CONTRACT.md` §팀원과 맞춰야 할 것 넷) 뒤에 온다. 그 회신이 없어도
이 골은 완료로 선다 — **그것이 이 순서로 짠 이유다.**

**다음 골 후보 (이 골에서는 하지 않는다)** — 터틀봇 실행 기록이 이미
`{"layoutId": null, "metrics": {"travelMm": 77, "source": "mock"}}` 모양으로 남는다.
**그 `null` 을 채우면 목업이 아닌 실데이터가 하나 생긴다.** 다만 `TurtleBot/` 은 이 골의
경계 밖이라 별도 골로 뗀다.

## 6. Blocked stop condition

- 팀원이 못 주는 필드가 드러나 **필수 둘**조차 못 채우면 멈춘다 — 그건 계약 재협상이다
- 무진전 3패스면 blocked

## 7. 실행 기록

*(미착수)*

## 참조

- `docs/ref/plan/MILESTONES.md` L3 · `docs/ref/product/PRD.md` §성공 판정 ·
  `docs/ref/contract/LAYOUT-METRICS-CONTRACT.md` §생산성 지표
