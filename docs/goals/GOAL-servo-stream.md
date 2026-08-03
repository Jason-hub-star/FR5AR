# GOAL-servo-stream — 목표를 끊김 없이 흘려보낸다

FR5 사다리 5/6. 앞: [GOAL-optimize-history.md](GOAL-optimize-history.md) ·
다음: [GOAL-imitation-demo.md](GOAL-imitation-demo.md).
**모방학습의 선행 조건**이다 (D47) — `MoveJ` 로는 정책의 초당 수십 프레임을 못 받는다.

## 골 한 줄

```
브리지가 주기적 관절 목표를 받아 로봇을 끊김 없이 움직이고, 상한을 넘거나 끊기면 스스로 멈춘다
verified by mock 스트리밍 게이트 + 실기 연속 궤적 실렌더 + `bash scripts/check/all.sh`
while preserving stop 최우선과 사다리 1~4 green.
details in docs/goals/GOAL-servo-stream.md
```

## 1. Outcome

1. `POST /servo/start`(현장확인) → WS `{"cmd":"servo","jointsDeg":[...]}` 주기 수신 →
   `POST /servo/stop`. 브리지가 `ServoMoveStart`/`ServoMoveEnd` 를 **짝으로** 관리한다
2. **각속도로 판정한다** — 프레임 간 변화 ≤ `30°/s × 실제 경과시간`. "명령당 5°" 를
   그대로 쓰지 않는다 (8ms 마다 5° 면 초당 625°)
3. **프레임 결손 3회 연속이면 스트리밍을 닫고 정지**한다 — 끊긴 스트림을 이어붙이면 튄다
4. 스트리밍 중에도 `stop` 이 최우선 — 소스를 먼저 끊고 `ServoMoveEnd` 로 닫는다
5. 비정상 종료(연결 끊김·조종권 소실)에도 `ServoMoveEnd` 가 반드시 불린다.
   시작만 하고 안 닫으면 다음 명령이 안 먹는다 (SDK 규약)
6. 3D 쌍둥이가 스트리밍 중에도 실물을 따라간다

## 2. Verification surface

```bash
node scripts/check/fr5-bridge-verify.mjs
# 각속도 초과 프레임 거부 · 결손 3회 자동 종료 · 스트리밍 중 stop 즉시 · start/end 짝 보장
node scripts/check/fr5-web-verify.mjs
bash scripts/check/all.sh
```

아티팩트 — `docs/evidence/` 에 **실기 연속 궤적 기록**: 사인파 같은 매끄러운 목표를
10초 흘려보내고 ①실측 관절이 목표를 따라간 오차 ②각속도가 상한 안이었는지
③중간 STOP 이 즉시 먹었는지. **끊김(가감속 재시작)이 없었다는 증거**가 핵심이다.

## 3. Constraints (후퇴 금지)

- `stop` 은 잠금도 스트리밍도 기다리지 않는다 (D45 · SAFETY-RULES 제3원칙)
- 기존 `MoveJ` 경로와 게이트 값 불변 — 스트리밍은 **별도 관문**이지 대체가 아니다
- 사다리 1~4 검증 green
- 스트리밍 최대 지속에 상한을 둔다 — 무한 스트림은 사람 확인 없는 장시간 자동 운전이다
- 실기 명령 허용목록에 `servo` 를 더하되, 그 외 새 이름은 더하지 않는다

## 4. Boundaries

- 허용 — `FR5/bridge/{main,safety}.py` · `robot_adapter/{base,mock,fairino}.py` ·
  `FR5/src/data/datasource/**` · `docs/evidence/**`
- 금지 — `fairino_sdk/**` · `Shared/**` · 새 의존성 0

## 5. 미니멀 사다리 적용 기록

① 필요한가 — 그렇다. 정책 실행의 물리적 전제다 (D47)
② 이미 있나 — 없다. SDK 에 `ServoJ` 는 있고 브리지 경로가 없다
③④ 벤더링 SDK 그대로. 실시간 프레임워크·ROS 안 쓴다
⑦ 어댑터 메서드 3개(`servo_start`·`servo_push`·`servo_end`) + 게이트 함수 1개 + WS 분기 1개

**천장** — 파이썬·WS 경로라 8ms 주기를 보장하지 못한다. 실측 가능한 주기(20~50ms)로
시작하고, 정책이 그보다 빨라야 하면 그때 경로를 다시 본다.

## 6. Blocked stop condition

- 실기에서 `ServoJ` 가 예상과 다르게 동작하면(가감속·필터 파라미터 미상) 멈추고 실측부터 한다
- 파이썬 경로의 주기 지터가 게이트를 상시 발동시키면 멈춘다 — 상한이 아니라 구조 문제다
- 무진전 3패스면 blocked. 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실

## 7. 실행 기록

*(비어 있음 — 구현 루프가 채운다)*
