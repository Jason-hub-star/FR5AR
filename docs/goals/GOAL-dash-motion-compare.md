# GOAL-dash-motion-compare — 같은 배치, 같은 작업, 다른 움직임

사다리 4/4. 앞: [GOAL-dash-metrics-compare.md](GOAL-dash-metrics-compare.md).
**MILESTONES L4(F10) · PRD 의 와우모먼트다.**

*"같은 조립 작업의 사이클 타임이 화면에서 **사람 시연 → 후처리 → 정책** 순으로 줄어드는 것을
나란히 보여준다. 배치를 못 옮기는 자리에서도 생산성이 오른다."*

⚠ **궤적은 FR5 가 만들고 여기는 읽기만 한다** — 관문끼리 직접 호출하지 않는다.
비교의 주인은 관제화면이고, 승인·실행의 주인은 FR5 다 (D74).

**새 화면이 아니다.** 사다리 3의 비교 축이 배치안 A·B 에서 **같은 배치의 동작 A·B·C** 로
바뀌는 것이고, 재생은 사다리 2가 이미 한다.

## 골 한 줄

```
같은 배치·같은 작업의 궤적 두 벌 이상이 나란히 재생되고 사이클 타임 차이가 % 로 나온다
verified by 궤적 2벌 실렌더 동시 재생 + 출처 배지 3종 + `bash scripts/check/all.sh`
while preserving 사다리 1~3 검증 green 과 Dashboard 명령 경로 0건.
details in docs/goals/GOAL-dash-motion-compare.md
```

## 1. Outcome (= MILESTONES L4 의 AC)

1. 같은 작업의 궤적 **두 개 이상**을 나란히 재생하고 사이클 타임 차이가 % 로 나온다
2. 각 궤적의 출처(`demo` / `postproc` / `policy`)가 화면에 표시된다 —
   사다리 2·3의 출처 규약과 **같은 방식**이다
3. **값이 하나뿐이어도 화면이 안 죽는다** — "비교 대상이 부족하다"고 그렇게 말한다
4. **1사이클 = 1발 조립**으로 분모가 고정돼 있다 (D51·D66)
5. **조건이 다른 궤적은 비교에서 제외**된다 — `stamp` 불일치·`fps` 불일치·`dropped > 0` ·
   `endReason != done` 은 나란히 놓지 않고 그 이유를 화면이 말한다 (D74)

## 2. Verification surface

```bash
bash scripts/check/timeline.sh    # 사다리 2의 게이트 — 궤적 N벌에서도 결정적
bash scripts/check/all.sh
npm run build:dash
```

아티팩트 — `docs/evidence/` 에 **두 벌 동시 재생**의 같은 시각 스냅샷과 사이클 타임 표.
**"몇 % 빨라졌다"가 화면 글자로 찍힌 장면**이 없으면 완료가 아니다.

## 3. Constraints (후퇴 금지)

- 사다리 1~3 의 §2 검증이 계속 green
- **Dashboard 는 여전히 명령을 안 보낸다** — 정책 궤적을 *재생*하는 것과 정책을 *실행*하는
  것은 다른 일이다. 실행은 `FR5/bridge/` 의 승인 관문을 탄다 (D36 · 하드 룰 3·4)
- 출처 배지가 `policy` 인 재생을 실기 성능으로 보고하지 않는다 — **시뮬레이션은 시뮬레이션이다**
- 새 의존성 0

## 4. Boundaries

- 허용 — `Dashboard/src/features/metrics/**` · `Dashboard/src/features/layout/**` ·
  `Shared/data/timeline/**` · `Shared/data/datasource/**` · `docs/evidence/**`
- 금지 — `FR5/bridge/**` · `TurtleBot/**` · `AR/**`

## 5. 미니멀 사다리 적용 기록

① 필요한가 — 그렇다. PRD 성공 판정의 **뒷 문장**이자 이 프로젝트의 와우모먼트다
② 이미 있나 — **재생기(사다리 2)와 비교 화면(사다리 3)이 이미 있다.**
   이 골은 **축을 하나 더 다는 것**이지 새 파이프라인이 아니다 (PRD §F10 이 그렇게 적었다)
③④⑦ 새 파일 0 을 목표로 한다

**천장(ceiling)** — 세 번째 값(`policy`)은 모방학습 사다리 4가 필요하다.
**두 개(`demo` · `postproc`)만으로도 이 골은 성립한다** (MILESTONES L4 §선행).

## 6. Blocked stop condition

- **선행이 안 서면 멈춘다** — 시연 녹화(모방학습 사다리 2)가 궤적을 하나도 못 내면
  비교할 것이 없다. 그건 `GOAL-imitation-demo.md` 쪽 일이다
- 궤적 두 벌의 **작업이 실제로 같은지** 보증할 방법이 없으면 멈춘다 —
  다른 작업의 사이클 타임을 비교하면 숫자가 거짓말을 한다
- 무진전 3패스면 blocked

## 7. 실행 기록

*(미착수)*

## 참조

- `docs/ref/plan/MILESTONES.md` L4 · `docs/ref/product/PRD.md` §F10·§성공 판정 ·
  `docs/goals/GOAL-imitation-demo.md`(궤적 공급원) · `docs/goals/GOAL-servo-stream.md`
