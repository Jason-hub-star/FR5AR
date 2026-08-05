# VISION-CONTRACT — 비전 제안 계약

분류: **SSOT**. `API-CONTRACT.md` 에서 갈라져 나왔다 (2026-08-05 · 무게 상한).
**비전은 로봇 명령을 만들지 않는다 — 제안을 만든다.** 실행은 승인 뒤 `moveJ`·`gripper` 로
번역돼 같은 게이트를 다시 탄다. 진입 문서는 `Vision/AGENTS.md`.

---

## 제안 — `POST /proposal` (2026-08-04 · D61)

**비전은 명령을 만들지 않는다. 제안을 만든다.** 비전값이 곧바로 명령이 되면 하드 룰 3
(사람 확인 없이 큰 동작 금지)과 정면으로 부딪힌다.

### 제안은 실기 명령이 아니다 — 승인되면 **번역**된다

**§명령의 허용목록(`jog`·`moveJ`·`gripper`·`stop`)은 그대로다.** `proposal` 은 그 목록에
새 이름을 더하지 않는다. 승인된 제안은 브리지가 `moveJ`·`gripper` 로 **번역**해서
**같은 게이트를 처음부터 다시 태운다.** 비전 전용 실행 경로를 만들지 않는다 — 만드는 순간
안전 게이트를 우회하는 두 번째 문이 생긴다 (감사 P1 원칙 유지).

```text
POST /proposal                       → { proposalId, verdict, reason, expiresAt }
GET  /proposals                      → 대기 목록 (화면이 고스트로 그린다)
POST /proposal/{id}/approve  { who, token }   → 여기서 moveJ·gripper 로 번역된다
POST /proposal/{id}/reject   { who, token }
```

```jsonc
// POST /proposal — 비전이 보내는 것
{
  "kind": "grasp",                    // grasp | align | retighten
  "source": "vision",
  "targetPose": { "tcpMmDeg": [412.5, -88.0, 210.3, 180, 0, 45] },   // mm · 도(°)

  "measuredAt": 1785329668.31,        // 촬영 시각 (§카메라 규약)
  "anchorPose": { "jointsDeg": [...], "tcpMmDeg": [...] },   // ★ 잴 때 로봇이 있던 자세
  "validUntil": 1785329698.31,        // 이 시각 넘으면 무효

  "depthValidAtMeasure": true,        // ★ 사각지대 밖에서 쟀나
  "minZmmAtMeasure": 195,
  "toolId": 0, "userId": 0,           // 잴 때의 좌표계
  "confidence": 0.87
}
```

```jsonc
// 응답
{ "proposalId": "p-7f3a",
  "verdict": "needsHumanConfirm",     // auto | needsHumanConfirm | rejected
  "reason": null,
  "expiresAt": 1785329698.31 }
```

### 판정은 3단이다

| verdict | 언제 | 그다음 |
|---|---|---|
| `auto` | 상한 안의 **작은 보정**만 | 바로 번역·실행 |
| `needsHumanConfirm` | 그 밖의 정상 제안 | 화면에 고스트로 뜨고 **사람이 누른다** |
| `rejected` | 사유와 함께 거부 | **아무 일도 안 일어난다** |

⚠ **지금은 `auto` 를 열지 않는다.** 전부 `needsHumanConfirm` 이다. 자동 통과는 실기 데이터가
쌓여 상한을 실측으로 정한 뒤에 연다. 여는 것은 나중에 쉽고, 닫는 것은 사고 뒤다.

거부 사유(`reason`)는 최소 이만큼을 구분한다 — `expired` · `depthInvalid` · `staleAnchor` ·
`outOfReach` · `overLimit` · `noOwner` · `notArmed` · `inDragTeach`(조건 25) ·
`toolCalibrationUnverified` · `cameraStale`.

**상한 값을 새로 만들지 않는다.** §안전 규칙과 `SAFETY-RULES.md` §상한을 그대로 쓴다.
비전용 상한을 따로 두면 그게 우회로가 된다.

### 못 박는 것 다섯

1. **`/proposal` 은 로봇을 움직이지 않는다.** 접수하고 판정만 반환한다. 실행은 `approve` 다.
   접수와 실행을 한 호출로 합치면 "제안"이라는 말이 거짓말이 된다
2. **`validUntil` 은 두 번 검사한다** — 접수할 때, 그리고 **번역·실행 직전 한 번 더.**
   승인 대기 중에 만료될 수 있다. 마지막 구간은 깊이가 없어(§카메라 · Min-Z) 이게 유일한
   방어선이다
3. **`anchorPose` 가 없으면 좌표가 틀린다.** hand-eye 가 손목 기준이라 실행 시점 자세가
   잴 때와 다르면 변환이 달라진다. 허용 반경을 벗어나면 `staleAnchor` 로 거부한다
4. **조종권은 접수가 아니라 승인에 건다.** 제안 접수는 토큰이 필요 없다(안전하니까).
   **`approve`·`reject` 는 토큰 필수** — 거기가 제안이 움직임으로 바뀌는 지점이다 (D55)
5. **제안·판정·승인·실행을 전부 기록한다.** 나중에 "왜 움직였나" 에 답해야 한다

### ⛔ 선행 조건 — 툴 좌표계 캘리브레이션

비전은 본질적으로 **TCP 좌표**(뚜껑이 어디 있나)로 목표를 낸다. 그런데 이 개체의 툴 0 에는
근거를 모르는 `[0,0,135,0,0,0]` 오프셋이 이미 들어 있고 **정확도가 미검증이다**
(위 §로봇 안전 설정 ⚠). 관절값 저장 + `MoveJ` 재생 조합은 이 미검증에 영향받지 않지만,
**좌표 기반 이동은 받는다.**

→ **툴 좌표계 캘리브레이션이 검증되기 전까지 `tcpMmDeg` 목표는 `rejected`**
(`toolCalibrationUnverified`) 로 fail-closed 한다. 계약은 지금 적어 두되 **실행 경로는
선행 골이 끝나야 열린다.** 이 순서를 뒤집으면 파지 실패가 아니라 충돌이 된다.
