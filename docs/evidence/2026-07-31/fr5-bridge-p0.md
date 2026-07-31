# FR5 브리지 P0 — profile·preflight·상태 스트림 검증

분류: **증거**. mock 어댑터로 P0 완료 판정을 닫았다. 실기는 건드리지 않았다.

## 어떻게 쟀나

`node scripts/check/fr5-bridge-verify.mjs` — 브리지를 시험 포트 5155 에 직접 띄우고
REST/WS 왕복 18개를 판정한다. **18/18 PASS** (2026-07-31).

## 계획의 완료 증거와 대응

`FR5-IMPLEMENTATION-PLAN.md` §구현 순서 P0 의 요구와 검사 결과:

| 요구 | 판정 |
|---|---|
| 다른 IP 프로필 교체 | `fr5-mock-a`(mock://a) → disconnect → `fr5-mock-b`(mock://b) 재연결 성공 |
| 잘못된 모델 fail-closed | `fr5-mock-broken`(model FR3) → `ok:false` + "모델 불일치" 사유 + `phase: FAIL_CLOSED` |
| 누락 안전 필드 fail-closed | `safety.safetyStop` drop → 사유 목록에 포함 |
| observe-only 기본 | `observeOnly:false` 요청 거부. mock 상태 `enabled:false` 유지 |
| 실기 미접촉 | `fr5-lab-a`(fairino) 연결은 어댑터가 네트워크 이전에 거부 — Python SDK 미확인 블로커 그대로 |

## 실측값

- WS `/ws/state` 1초 30프레임 — 33ms 목표 대비 정합 (유니티 실측 27Hz 와 같은 자리)
- 미연결·FAIL_CLOSED 에도 `/state` 는 같은 스키마 15키를 반환 (D40)
- mock `/version` 은 실측 펌웨어 문자열(FR_CTRL_FV2.010.12 등)을 쓰되 `sdk: "mock-0.1"` 로
  실기 SDK 를 사칭하지 않는다

## 남긴 천장 (ponytail)

WS 접속마다 `read_state()` 를 따로 부른다 — mock 은 무해하나 실기 SDK 는 다중 접속 시
중복 폴링이 된다. V0 실기 어댑터 때 단일 샘플러 + 팬아웃으로 승격한다 (`main.py` 주석).
