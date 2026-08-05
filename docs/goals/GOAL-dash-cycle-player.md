# GOAL-dash-cycle-player — 배치 화면이 한 사이클을 재생한다

사다리 2/4. 앞: [GOAL-dash-datasource.md](GOAL-dash-datasource.md) ·
다음: [GOAL-dash-metrics-compare.md](GOAL-dash-metrics-compare.md).

**"컨베이어를 돌리는 코드"를 짜면 버려진다.** 짜야 할 것은 **시간축 재생기**다.
그러면 같은 코드가 네 곳을 먹는다 — 지금(목업) · L3(팀원 sim) · **L4(동작 3벌 = 와우모먼트)** ·
V4(기록 되감기). 컨베이어만 돌리면 한 곳도 안 먹는다.

**비교 화면(사다리 3)보다 먼저 하는 이유** — L4 는 재생기가 전부이고 L3 는 표 하나다.
**위험이 큰 쪽을 먼저 친다.** 시간 모델이 틀리면 사다리 4가 통째로 다시다.

## 골 한 줄

```
배치 화면이 series 를 받아 팔·컨베이어·탄두를 시간에 맞춰 움직이고 출처를 말한다
verified by `bash scripts/check/timeline.sh`(신설) + 재생 전/중/후 실렌더 3장
  + `bash scripts/check/all.sh` + `npm run build:dash`
while preserving 편집 기능 회귀 0 · Dashboard 에 로봇 명령 경로 0건(D36).
details in docs/goals/GOAL-dash-cycle-player.md
```

## 0. 선행 — 문서가 먼저다 (하드 룰 1)

**지금 모델에는 시간이 없다.** `schema.js` 는 floor·arm·stations·amrs 뿐 전부 공간이다.
`SHARED-CORE.md` 에 절을 먼저 연다 — **"layout 은 공간, series 는 시간"**.
`series: [{tSec, event, station}]` 자체는 `LAYOUT-METRICS-CONTRACT.md` 에 **이미 있다.**
아무도 안 쓸 뿐이다. 새 계약이 아니라 **있는 계약에 소비자를 붙이는 일**이다.

## 1. Outcome

1. `Shared/data/timeline/` — `stateAt(series, tSec)` **순수 함수**. 렌더 없음·React 없음.
   그 순간의 { 탄두 단계 · 컨베이어 진행 mm · 팔 자세 · AMR 위치 } 를 돌려준다
2. 재생·정지·타임라인 스크럽. 배선은 **이미 있는 `stage.onTick`**(`stage.js:116`)
3. 화면에서 셋이 움직인다 — 컨베이어 벨트 흐름 · 팔(`createPlayer` · `path.js:79`) ·
   **`warhead({ stage })` 0→3 으로 쪼개지는 탄두**(진행률이 형태에서 공짜로 나온다 · MILESTONES S1)
4. **출처 배지가 재생기에도 붙는다** — `mock | sim | demo | policy`.
   **움직이는 3D 로봇은 숫자보다 훨씬 강하게 "실물"로 읽힌다.** 이 골에서 SR_24 가 가장 위험하다
5. **재생은 읽기다.** Dashboard 에 로봇 명령 경로가 코드에 존재하지 않는다
   (D36 · 하드 룰 4 · 계약 "재생은 실기 명령을 보내지 않는다")
6. series 가 없거나 비면 화면이 안 죽고 **"재생할 것이 없다"고 말한다**

## 2. Verification surface

```bash
# ① 시간 함수의 경계 — 여기가 조용히 틀리는 자리다
bash scripts/check/timeline.sh
#   t<0 · t>끝 · 빈 series · 이벤트 1개 · 뒤섞인 tSec 에서 던지지 않는다
#   t 가 커질 때 진행이 뒤로 안 간다(단조)
#   같은 t 를 두 번 물으면 같은 값이다(결정적 — 되감기가 성립하는 조건)

# ② 명령 경로가 없다
grep -rn "POST\|/servo\|/move\|/arm" Dashboard/src/    # → 0건

# ③ 게이트·빌드
bash scripts/check/all.sh
npm run build:dash
```

아티팩트 — `docs/evidence/` 에 **재생 전 / 중 / 후 실렌더 3장**과 그때의 `stateAt` 값.
탄두 단계가 그림에서 실제로 바뀌는 것을 눈으로 본 기록이 없으면 완료가 아니다.

## 3. Constraints (후퇴 금지)

- 사다리 1의 §2 검증이 계속 green — 화면은 여전히 `fetch`·`localStorage` 를 모른다
- `Shared/view3d/` 에 **React 금지** · `dispose()` 없이 3D 마운트 금지 (탭 왕복 WebGL 누수)
- **편집 기능 회귀 0** — 재생 중에도 끌기·선택이 깨지지 않거나, 재생 중 편집을 명시적으로 잠근다
- 단위 변환은 `Shared/data/units/` 한 곳 (하드 룰 5)
- 새 의존성 0 · 새 자산 0 (`Shared/assets/` 용량 불변)

## 4. Boundaries

- 허용 — `Shared/data/timeline/**` · `Shared/view3d/lab/**` ·
  `Dashboard/src/features/layout/**` · `docs/ref/contract/SHARED-CORE.md` · `scripts/check/timeline.sh`
- 금지 — `FR5/**` · `TurtleBot/**` · `AR/**` · `Shared/data/layout/schema.js`(공간 모델 불변)

## 5. 미니멀 사다리 적용 기록

① 필요한가 — 그렇다. L4(와우모먼트)의 전부이고, 그 전에 화면이 정지 그림이다
② **이미 있나 — 3/4 가 있다.** `stage.onTick` · `createPlayer` · `warhead({stage})` ·
   그리고 `series` **계약까지**. 없는 것은 그 넷을 잇는 시간 모델 하나뿐이다
③④ 순수 함수 + 이미 있는 훅. 애니메이션 라이브러리·상태머신 라이브러리 안 쓴다
⑦ 새 파일은 `timeline/` 하나

**천장(ceiling)** — 이 재생기는 **기록 재생**이다. 실물 로봇이 움직이는 대로 따라 도는
실시간 쌍둥이(F2·V1)는 `FR5/` 몫이고 이 골이 아니다. 둘을 한 화면에 섞으면 배지가
`live` 인지 `mock` 인지가 곧바로 안전 문제가 된다.

## 6. Blocked stop condition

- 실제 사이클의 공정 수가 있어야 series 를 못 만들겠으면 멈춘다 —
  **"조립 공정 중 어디까지를 로봇이 하나"는 팀 결정 대기(GAP BLOCKED)**.
  단 데모는 **"신관 결합" 한 단계**로 먼저 선다고 이미 적혀 있다 (D66) → 그걸로 진행
- 무진전 3패스면 blocked

## 7. 실행 기록

**2026-08-04 · Claude Code · 패스 1 → `ready-for-review` · 골 닫음**

| 검증 | 기대 | 결과 |
|---|---|---|
| ① `stateAt` 경계·결정성 | 통과 | **통과** — 망가진 입력 8종 × 시각 6개, 안 던짐 |
| ② 관제화면 명령 경로 | 0건 | **0건** |
| ③ `bash scripts/check/timeline.sh` | 통과 | **통과** · **주입 3건 다 잡음** |
| ④ `bash scripts/check/all.sh` | 전체 통과 | **전체 통과** |
| ⑤ `npm run build:dash` | 성공 | **성공** (227ms) |
| ⑥ 실렌더 재생 | 움직인다 | **28/28** (사다리 1의 17 + 재생 11) |
| ⑦ 실렌더 그림 | 3장 | **`cycle-t{02,13,22}.png`** |

- **재현됨** — Outcome 1~6 전부. 작업물이 store→in→meas→out 을 지나며 탄두가 0→1→2→3 으로
  쪼개지고, 3.5초 위치 [8850, 5625] 가 **손계산 중점과 정확히 일치**
- **근사됨** — Outcome 3 의 "팔": **베이스 요각만** 돈다. 6축 궤적은 시연 녹화가 있어야 하고
  **없는 궤적을 지어내지 않았다** (§천장 그대로)
- **막힘** — 없음
- **불확실** — 손 · 폰 · 긴 재생의 프레임/메모리 · AMR 은 안 움직인다(계약이 시간을 선언 안 함)

**실렌더가 잡은 것 셋** — ①스크럽 0 에서 작업물이 사라졌다(재생 여부를 시각으로 판정)
②바닥 표식이 작업대 밑에 깔렸다 ③안 보이는 표식이 원점에서 방 밖까지 상자를 늘렸다
(`scene-axes.sh` 가 잡음). **셋 다 "될 것이다" 로는 안 나왔다.**

바꾼 것 — `Shared/data/timeline/timeline.js`(신설) · `datasource/mock.js`(`getSeries`) ·
`view3d/lab/layout-view.js`(`setPlayback`) · `LayoutView.jsx` · `LayoutEditor.jsx` ·
`main.css` · `scripts/check/timeline.sh`(신설) · 계약 2건

근거 — `docs/evidence/2026-08-04/cycle-player.md`

## 참조

- `docs/ref/contract/LAYOUT-METRICS-CONTRACT.md` §요구 모양(`series`) ·
  `docs/ref/plan/MILESTONES.md` S1 §탄두는 소품이 아니라 작업물이다
- `Shared/view3d/lab/stage.js:116` · `Shared/view3d/path.js:79`
