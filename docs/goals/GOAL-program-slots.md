# GOAL-program-slots — 지점을 순서로 엮어 승인한 것만 실행한다

FR5 사다리 3/4. 앞: [GOAL-teach-points.md](GOAL-teach-points.md) ·
다음: [GOAL-optimize-history.md](GOAL-optimize-history.md).
계약은 `docs/ref/API-CONTRACT.md` §프로그램 슬롯.

## 골 한 줄

```
지점을 카드로 엮어 draft→approve→run 하고, 승인 때 정체가 실행 직전에 재대조된다
verified by mock 수명주기 왕복 + 실기 1슬롯 실행 실렌더 + `bash scripts/check/all.sh`
while preserving 사다리 1·2 green 과 실기 명령 허용목록 불변.
details in docs/goals/GOAL-program-slots.md
```

## 1. Outcome

1. 지점을 골라 **단계 목록**(move·grip·wait)으로 엮는다 — 임의 코드 편집기는 없다
2. 고칠 때마다 **불변 리비전**이 쌓이고, 활성 버전은 포인터만 바뀐다 (이전으로 즉시 복귀)
3. `approve` 는 조종권+현장확인을 요구하고, **당시 정체**(프로필·펌웨어·tool/user·그리퍼)를
   리비전에 고정 기록한다
4. `run` 은 **approved 리비전만**, 그리고 **실행 직전에 고정값과 현재 세션을 재대조**한다 —
   다르면 fail-closed (고정만 하고 안 보면 옛 승인이 바뀐 실기에 나간다)
5. **중단 후 자동 재개는 없다** — 마지막 완료 스텝을 기록하고, 재개는 사람이 스텝을 고른다
6. grip 단계는 **성패를 판정**한다 — 목표 대비 실측 개폐가 임계 밖이면 그 자리에서 정지

## 2. Verification surface

```bash
node scripts/check/fr5-bridge-verify.mjs
# draft→approve→run 통과 · 미승인 run 거부 · 정체 불일치(프로필 교체) run 거부
# · 중간 stop 후 자동재개 없음 · grip 실패 주입 시 다음 단계 미실행
bash scripts/check/all.sh
```

아티팩트 — `docs/evidence/` 에 **실기 1슬롯 실행 기록**: 3단계(move→grip→move)를
승인하고 실행해 관절·그리퍼가 순서대로 움직인 값, 중간 STOP 이 즉시 먹은 것,
그리고 **미승인 리비전 실행이 거부된 응답**까지.

## 3. Constraints (후퇴 금지)

- 사다리 1·2 검증 green
- **실기에 닿는 cmd 허용목록**(`jog`·`moveJ`·`gripper`·`stop`)에 새 이름을 더하지 않는다 —
  슬롯 실행은 이 넷을 통해서만 하드웨어에 닿는다
- 모든 단계가 매번 기존 안전 게이트를 다시 통과한다 (일괄 승인으로 게이트를 건너뛰지 않는다)
- 슬롯·리비전은 `~/fr5-data/slots/` — 배포 트리 밖

## 4. Boundaries

- 허용 — `FR5/bridge/**`(SDK 제외) · `FR5/src/features/program/**` · datasource · 탭 활성화 ·
  `docs/evidence/**`
- 금지 — `fairino_sdk/**` · `Shared/**` · 원시 코드 업로드 기능 · 새 의존성 0

## 5. 미니멀 사다리 적용 기록

① 필요한가 — 그렇다. "가르친 것을 재생한다"가 PRD 의 핵심 기능이다
② 이미 있나 — 없다. 지점(사다리 2)이 재료
③④ JSON 파일 + 순차 실행기. 워크플로 엔진·상태머신 라이브러리 안 쓴다
⑦ 실행기는 단계 배열을 도는 루프 하나 — 각 단계가 기존 명령 함수를 부른다

**천장** — 분기·반복 없는 **선형 단계 목록**만. 조건 분기가 필요해지면 그건 다음 골이다.

## 6. Blocked stop condition

- 실행 중 상태 전이(EXECUTING↔ARMED)가 계약과 어긋나면 멈추고 계약을 먼저 고친다
- grip 성패 임계값을 실측으로 못 정하면 멈춘다 (사다리 1의 대응표가 선행 재료다)
- 무진전 3패스면 blocked. 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실

## 7. 실행 기록

*(비어 있음 — 구현 루프가 채운다)*
