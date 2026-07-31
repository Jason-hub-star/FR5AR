# FR5 P0·P1 — mock 기준 브리지·Live 화면 검증

분류: **증거**. FR5 구현 P0(브리지)·P1(Live 화면)을 mock 으로 닫았다. 실기 무접촉.
P2 와 실기 경로는 fr5-p2-owner-jog.md · fr5-cs-adapter.md.

### 어떻게 쟀나

`node scripts/check/fr5-bridge-verify.mjs` — 브리지를 시험 포트 5155 에 직접 띄우고
REST/WS 왕복 18개를 판정한다. **18/18 PASS** (2026-07-31).

### 계획의 완료 증거와 대응

`FR5-IMPLEMENTATION-PLAN.md` §구현 순서 P0 의 요구와 검사 결과:

| 요구 | 판정 |
|---|---|
| 다른 IP 프로필 교체 | `fr5-mock-a`(mock://a) → disconnect → `fr5-mock-b`(mock://b) 재연결 성공 |
| 잘못된 모델 fail-closed | `fr5-mock-broken`(model FR3) → `ok:false` + "모델 불일치" 사유 + `phase: FAIL_CLOSED` |
| 누락 안전 필드 fail-closed | `safety.safetyStop` drop → 사유 목록에 포함 |
| observe-only 기본 | `observeOnly:false` 요청 거부. mock 상태 `enabled:false` 유지 |
| 실기 미접촉 | `fr5-lab-a`(fairino) 연결은 어댑터가 네트워크 이전에 거부 — Python SDK 미확인 블로커 그대로 |

### 실측값

- WS `/ws/state` 1초 30프레임 — 33ms 목표 대비 정합 (유니티 실측 27Hz 와 같은 자리)
- 미연결·FAIL_CLOSED 에도 `/state` 는 같은 스키마 15키를 반환 (D40)
- mock `/version` 은 실측 펌웨어 문자열(FR_CTRL_FV2.010.12 등)을 쓰되 `sdk: "mock-0.1"` 로
  실기 SDK 를 사칭하지 않는다

### 남긴 천장 (ponytail)

WS 접속마다 `read_state()` 를 따로 부른다 — mock 은 무해하나 실기 SDK 는 다중 접속 시
중복 폴링이 된다. V0 실기 어댑터 때 단일 샘플러 + 팬아웃으로 승격한다 (`main.py` 주석).


### 어떻게 쟀나

`node scripts/check/fr5-web-verify.mjs` — fr5-bridge(5157)와 vite dev(5176)를 직접 띄우고
헤드리스 Chrome(CDP)으로 15개를 판정한다. **15/15 PASS** (2026-07-31). 스크린샷 육안 확인 병행.

### 판정 내역

| 영역 | 확인된 것 |
|---|---|
| 뼈대 | 패널 5탭(Live 만 활성) · 상시 안전 바 8항목 · 미연결에 DISCONNECTED 표시 |
| fail-closed 표면 | 실기 프로필 연결 시도 → "미구현" 거부 사유가 화면에 사람이 읽게 뜬다 (D40) |
| 연결 | mock 연결 → 안전 바 OBSERVE_ONLY · 출처 배지 `mock`(사칭 없음) · 실측 펌웨어 문자열 표시 |
| 스트림 | 관절 표가 WS 를 따라 갱신 (실측 `-80.732 → -80.480`) · TCP 6행 |
| 3D | URDF+그리퍼 로딩 깃발 + **캔버스 픽셀 diff 실렌더** (mock 숨쉬기) |
| 재연결 | 브리지 kill→재기동 → WS 자동 재연결(실측 3회 기록) → 재연결 뒤 OBSERVE_ONLY 재진입 |
| 해제 | disconnect → DISCONNECTED + 값 '—' 복귀 |

### 육안 확인

스크린샷에서 팔+그리퍼가 실측 기준 자세(j1 -80.4° 등)로 렌더되고, 값 표가 evidence
readback 값과 자리수까지 일치했다 (`fr5-live-readback.md` 대조).

### 확인하지 않은 범위

- 10분 지속 폴링 (V0 AC — 실기 승격 체크리스트에서)
- 폰 실기 터치·성능 — 좁은 화면 CSS 는 넣었으나 실폰 미확인
- 30Hz setState 재렌더 비용 — TB 선례(10Hz)보다 잦다. 느려지면 값 표만 스로틀한다
