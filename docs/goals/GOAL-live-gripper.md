# GOAL-live-gripper — 화면에서 그리퍼를 연다·닫는다

FR5 사다리 1/6. 다음: [GOAL-teach-points.md](GOAL-teach-points.md).
계약은 `docs/ref/contract/API-CONTRACT.md` §그리퍼, 실측 근거는 `docs/evidence/2026-08-03/fr5-field-gates.md`.

## 골 한 줄

```
Live 패널에서 조종권자가 그리퍼를 지정한 %로 열고 닫으며 실측값이 화면에 돌아온다
verified by mock 게이트 + 실기 개폐 실렌더 + `bash scripts/check/all.sh`
while preserving 기존 33/33·21/21 검증 green 과 관절 게이트 불변.
details in docs/goals/GOAL-live-gripper.md
```

## 1. Outcome

1. Live 패널에 그리퍼 슬라이더/버튼이 있고 **ARMED·조종권일 때만** 활성된다
2. 지령 %와 실측 %가 **같은 방향으로** 화면에 보인다 — 브리지가 한 곳에서 변환한다
   (실측: 지령 30 → 읽기 76. 변환을 화면에 흩뿌리면 하드 룰 5 위반)
3. `state.gripper` 가 `{ pct, fault, motionDone, active }` 를 싣고, 못 읽으면 `missing` 으로
   올라가 fail-closed 된다
4. 그리퍼 전용 게이트를 탄다 — 관절용 5°·URDF 한계·모션큐는 **걸지 않는다**
5. 활성화(`ActGripper`)가 안 된 상태에서 이동 명령을 보내면 사람이 읽는 사유로 거부된다

## 2. Verification surface

```bash
node scripts/check/fr5-bridge-verify.mjs   # mock — 그리퍼 항목 추가 후 전건 통과
node scripts/check/fr5-web-verify.mjs      # 실렌더 — 슬라이더 비활성/활성 전이
bash scripts/check/all.sh
```

아티팩트 — `docs/evidence/` 에 **실기 개폐 기록**: 지령 %와 그때 읽힌 %의 대응표
(최소 3점: 완전열림·중간·완전닫힘)와, 손가락이 실제로 움직인 육안 확인.
**대응표가 없으면 완료가 아니다** — 방향 반전을 추측으로 넘기면 Teach 지점의 개폐값이 전부 틀린다.

## 3. Constraints (후퇴 금지)

- 선행: **stop 잠금 분리·xmlrpc 타임아웃**은 이 골 착수 전에 이미 수리됐다 (D45). 되돌리지 않는다
- 선행: **안전 설정 적용(D53)** — 페이로드 0.6kg·충돌 감지가 ARM 에서 들어가야 한다.
  그리퍼가 붙으면 사람 손과 접촉할 일이 늘어난다. 이것 없이 그리퍼를 여닫지 않는다
- 기존 mock 33/33 · 실렌더 21/21 계속 green
- 관절 안전 게이트 값 불변 (10% · 5° · 신선도 0.5s)
- 힘(force) 기본값은 보수적으로 — 파지 실험은 이 골 범위 밖

## 4. Boundaries

- 허용 — `FR5/bridge/{main,safety}.py` · `robot_adapter/{base,mock,fairino}.py` ·
  `FR5/src/features/live/**` · `FR5/src/data/datasource/http.js` · `docs/evidence/**`
- 금지 — `fairino_sdk/**`(벤더링 원본) · `Shared/**` · 새 의존성 0

## 5. 미니멀 사다리 적용 기록

① 필요한가 — 그렇다. 그리퍼 없이는 pick 이 성립하지 않아 P3~P4 전체가 막힌다
② 이미 있나 — 계약에 명령 이름만 있고 구현 0. SDK 호출은 실측 확정 (`STACK.md` §그리퍼)
③④⑤ 벤더링 SDK 그대로 — 새 라이브러리 없음
⑥⑦ 어댑터 메서드 2개(`gripper_move`·`gripper_activate`) + 게이트 함수 1개 + 화면 1블록

**천장** — 손가락 개폐를 3D 쌍둥이에 반영하지 않는다(URDF에 prismatic 관절이 없다).
숫자로만 보여주고, 시각화는 URDF 확장 때 붙인다.

## 6. Blocked stop condition

- 지령↔읽기 대응이 **선형이 아니면** 멈추고 보고한다 — 비선형이면 변환표가 필요하고 그건 별도 골
- 활성화가 실기에서 재현되지 않으면(펜던트 설정 의존) 멈춘다
- 무진전 3패스면 blocked. 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실

## 7. 실행 기록

*(비어 있음 — 구현 루프가 채운다)*
