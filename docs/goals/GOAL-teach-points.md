# GOAL-teach-points — 자세를 지점으로 남기고 다시 불러온다

FR5 사다리 2/4. 앞: [GOAL-live-gripper.md](GOAL-live-gripper.md) ·
다음: [GOAL-program-slots.md](GOAL-program-slots.md).
계약은 `docs/ref/API-CONTRACT.md` §이동 지점 (P3 Teach).

## 골 한 줄

```
현재 자세를 이름 붙여 저장하고 목록에서 다시 그 자세로 돌아간다
verified by mock 왕복 + 실기 캡처→재로드 실렌더 + `bash scripts/check/all.sh`
while preserving 좌표계·개체 귀속 검증과 사다리 1 green.
details in docs/goals/GOAL-teach-points.md
```

## 1. Outcome

1. Teach 패널에서 **현재 자세를 캡처**한다 — 값은 클라이언트가 아니라 **서버가 읽어** 굳힌다
2. 지점 하나에 관절·TCP·**그리퍼 개폐%**·tool/user·`capturedRobotId`·시각이 함께 남는다
3. 목록에서 고르면 **그 자세로 이동**한다 (기존 moveJ 게이트 그대로)
4. **삭제는 참조가 없을 때만** — 참조 슬롯이 있으면 409 와 참조 목록을 돌려준다
5. 좌표계·개체가 캡처 때와 다르면 **이동 전에 막고 사유를 보여준다**
6. 데이터는 `~/fr5-data/points/` 에 남아 **배포·재부팅을 견딘다** (D45)

## 2. Verification surface

```bash
node scripts/check/fr5-bridge-verify.mjs   # 캡처→목록→이동→삭제 왕복 + 참조 409
bash scripts/deploy/fr5-ubuntu.sh          # 배포 후에도 지점이 살아 있다 (rsync --delete 생존)
bash scripts/check/all.sh
```

아티팩트 — `docs/evidence/` 에 **실기 왕복 기록**: 로봇을 조그로 옮김 → 캡처 →
다른 자세로 이동 → 목록에서 그 지점 선택 → **원래 자세로 돌아온 관절값 대조**(±0.05° 이내).
그리고 **배포 한 번 돌린 뒤 지점이 그대로인 것**까지. 데이터 생존을 안 본 기록은 완료가 아니다.

## 3. Constraints (후퇴 금지)

- 사다리 1(그리퍼) 검증 계속 green — 캡처가 그리퍼 %를 싣는다
- 캡처도 **신선도 게이트**를 탄다 (0.5s) — 캐시된 마지막 값을 굳히지 않는다
- 저장 경로는 배포 트리 **밖**. 트리 안에 두면 `rsync --delete` 가 지운다
- 기존 관절 게이트·조종권 규칙 불변

## 4. Boundaries

- 허용 — `FR5/bridge/**`(SDK 벤더링 제외) · `FR5/src/features/teach/**` ·
  `FR5/src/data/datasource/http.js` · `FR5/src/main.jsx`(탭 활성화) · `docs/evidence/**`
- 금지 — `fairino_sdk/**` · `Shared/**` · 새 의존성 0 (저장은 파일 JSON — DB 도입 안 함)

## 5. 미니멀 사다리 적용 기록

① 필요한가 — 그렇다. P4 슬롯이 지점을 참조하므로 이게 없으면 프로그램이 성립 안 함
② 이미 있나 — 계약에만 있고 코드 0
③④ **표준 라이브러리 JSON 파일**로 끝난다 — DB·ORM 안 쓴다
⑦ 화면은 목록 + 캡처 버튼 + 이동 버튼

**천장** — 파일 하나에 지점 전부를 담는다. 동시 쓰기는 조종권 1명 규칙이 사실상 막지만,
여러 로봇·수백 지점으로 커지면 그때 갈라야 한다.

## 6. Blocked stop condition

- 저장 경로를 우분투에 만들 권한이 없으면 멈춘다 (배포 스크립트가 만들어야 하는 문제)
- 캡처값과 재이동 결과가 ±0.05° 안에 안 들어오면 멈추고 원인을 먼저 보고한다
- 무진전 3패스면 blocked. 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실

## 7. 실행 기록

*(비어 있음 — 구현 루프가 채운다)*
