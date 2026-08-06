# 터틀봇 실기 접속 가능성 실측 (2026-08-06)

**판정 — 못 붙는다. 막힌 곳이 셋이고, 그중 둘은 로봇 전원과 무관하다.**

문서가 들고 있던 전제("WiFi 교체 후 `config.yaml` 만 갱신하면 재개")가 **틀렸다**.
WiFi 는 이미 교체됐고, 남은 건 값 하나가 아니라 **포트 충돌 하나 + 로봇 전원 하나**다.

## 잰 것

맥(`192.168.30.9`)에서 우분투 PC 로. 전부 읽기 전용 — 아무것도 기동·정지하지 않았다.

| 확인 | 명령 | 결과 |
|---|---|---|
| 옛 주소 생존 | `ping 192.168.11.2` | **100% loss** — WiFi 교체로 사라진 대역 |
| 현재 PC 생존 | `ping 192.168.30.240` | **OK** |
| PC 인터페이스 | `ip -brief addr` | `wlxb0386cf6fa9a 192.168.30.240/24` · `enp3s0 192.168.58.10/24`(FR5 로봇 대역) |
| 5055 의 주인 | `POST /connect` (본문 없이) | **422** — 라우트가 있다 = **FR5 브리지**. tb-bridge 면 404 였을 것 |
| tb 라우트 | `GET /api/slots` · `/api/maps` | **404** — tb-bridge 아님이 재확인 |
| 프로세스 | `pgrep -af uvicorn` | uvicorn **1개**(5055). tb-bridge 프로세스 없음 |
| 코드 배포 | `ls ~/fr5tb` | `TurtleBot` — 코드는 올라가 있다 |
| ROS 토픽 | 도메인 **0·1·2·30** 각각 `ros2 topic list` | 전부 `/parameter_events`·`/rosout` **둘뿐** — 로봇 0대 |

## 왜 막혔나

**① 주소 드리프트 (문서 문제 · 고쳤다)**
`PROJECT-STATUS.md`·`GAP-MATRIX.md`·`tb-real-verify.mjs` 가 `192.168.11.2` 를 들고 있었다.
FR5 쪽은 D63 에서 `192.168.30.240` 으로 고정하며 갱신했는데 **터틀봇 쪽이 안 따라갔다**.
같은 기계인데 문서 두 벌이 다른 주소를 가리키고 있었다.

**② 포트 5055 충돌 (구조 문제 · 결정 필요)**
`TB-CONTRACT.md` 도 `FR5/bridge/config.yaml` 도 5055 다. 계약을 쓸 때 두 관문이
**다른 기계에 살 거라고 암묵 가정**했는데, 실제로는 우분투 PC 한 대에 둘 다 산다.
지금 그 자리는 FR5 가 systemd 로 잡고 있다 — tb-bridge 는 **띄우려는 시도조차 못 한다.**

"FR5 `bridge/` 와 형제·무의존" 은 **코드 의존을 말한 것**이지 포트를 나눈다는 뜻이 아니었다.
로봇을 켜도 이건 안 풀린다.

**③ 로봇 전원 (사람이 해야 한다)**
도메인 넷을 훑어 토픽이 0개다. bringup 이 안 켜져 있다.
그래서 `config.yaml` 의 `ros_domain_id: 2/1`(repo2 에서 베낀 값)이 맞는지도 **판별 불가**다 —
켜야 대조된다.

## 고친 문서

| 파일 | 무엇 |
|---|---|
| `docs/status/PROJECT-STATUS.md` §터틀봇 관제 트랙 | 주소 갱신 + 막힌 곳 3개 + 재개 순서 |
| `docs/status/GAP-MATRIX.md` | **포트 충돌 OPEN 행 신설** · 배포 행 주소 갱신 · 실주행 행을 실측으로 갱신 |
| `docs/ref/contract/TB-CONTRACT.md` | §왜 이 서버가 필요한가 에 미해결 경고 · §검증된 값 에 PC 주소·도메인·로봇 IP 행 |
| `TurtleBot/AGENTS.md` | 제목 + 접속 경고 |
| `scripts/check/tb-real-verify.mjs` | `11.2` → `30.240` · `TB_REAL` 환경변수로 덮어쓰게 · 포트 경고 |

**계약 값(5055)은 안 바꿨다.** 번호를 가르는 건 결정이고, 결정은 `DECISION-LOG` 를 거쳐
코드까지 같이 움직여야 한다 (하드 룰 1). 지금은 **사실만 적었다**.

---

# 2부 — 포트를 갈랐다 (같은 날 · D80)

**②를 닫았다. tb-bridge 는 5056 이고, 화면 코드는 0줄 고쳤다.**

## 왜 쌌나 — 클라이언트가 포트를 몰랐다

`TurtleBot/src/data/datasource/http.js:5` 가 `location.host` 만 쓴다. 브리지가 빌드를 같은
출처에서 서빙하므로(D29) 포트는 애초에 클라이언트에 없다. **D29 의 설계가 3개월 뒤 이 비용을 냈다.**

## 고친 곳 — 그리고 죽은 필드 하나를 살렸다

| 파일 | 무엇 |
|---|---|
| `docs/ref/contract/TB-CONTRACT.md` | 다이어그램 5055→**5056** · 포트 정본 문장 (하드 룰 1 — 여기부터) |
| `TurtleBot/bridge/config.yaml` | `port: 5056` — **정본** |
| `scripts/dev/tb-dev.sh` · `scripts/robot/tb-run.sh` | `--port` 하드코딩 → `sed` 한 줄로 config 읽기 |
| `TurtleBot/vite.config.js` | dev 프록시 5056 (**유일한 사본**) |
| `scripts/check/consts.sh` | 게이트 신설 — config↔프록시 일치 · FR5 와 같은 번호 금지 |
| `scripts/dev/fr5-dev.sh` | "5055 겹친다" 주석이 거짓이 됐다 → 갱신 |

**`config.yaml` 의 `port: 5055` 는 원래 죽은 필드였다.** `main.py` 는 `CONFIG` 에서 `robots` 와
`disk_min_free_gb` 만 읽고, 실제 포트는 uvicorn CLI 인자였다. 계약의 **"WiFi 가 바뀌면
config.yaml 값 하나만 바뀐다"** 가 포트에는 거짓이었던 것이다 — 이번에 진짜로 읽게 했다.
셸에 yaml 파서를 들이지 않으려고 `sed` 한 줄을 쓴다.

## 잰 것

| 확인 | 결과 |
|---|---|
| `bash scripts/dev/tb-dev.sh bridge` → `GET :5056/api/slots` | **200** · `example_patrol` 1건 |
| vite dev(:5175) 프록시 → 브리지 | **200** — `/api/slots` 가 그대로 흐른다 |
| `check/consts.sh` | `tb=5056 · FR5=5055 · vite 프록시 일치` · exit 0 |
| 게이트 자가검증 (일치/불일치/FR5충돌/사본2개갈림/port없음 5케이스) | **5/5 기대대로** — 무는 게이트다 |
| `tb-bridge-verify.mjs` | **22 중 20 PASS** |

## 남은 빨강 2건은 포트와 무관하다 — A/B 로 갈랐다

`로그 백로그 수신` 과 `estop run 최신 등재` 가 빨갛다. **5055 로 되돌려 같은 검증을 돌렸더니
똑같은 2건이 났다** — 포트 변경의 회귀가 아니라 그 전부터 있던 것이다.

성격도 갈렸다 — **API 는 맞고 화면이 안 채운다.** `estop run 최신 등재` 바로 다음 줄인
`fetch('/api/runs')` 가 `travelMm` 을 받아 PASS 하는데, 같은 데이터를 그리는 표는
`기록이 없어요` 다. 2026-07-31 P2 는 20/20 이었으니 그 뒤 회귀다 → GAP-MATRIX 로 세웠다.

---

# 3부 — 실기 배포 (같은 날)

**`http://192.168.30.240:5056` 에서 돈다. 실렌더 6/6 PASS · FR5 는 5055 그대로.**

```
PASS  우분투 브리지가 웹앱 서빙 (탭 3)
PASS  adapter 배지 = real (실기 어댑터 물림)
PASS  로봇 카드 2대 (config: tb3_1·tb3_2)
PASS  로봇 fail-safe 표시 (bringup 전 → disconnected)   ← 로봇이 꺼져 있으니 이게 정답이다
PASS  슬롯 목록 로드 · 콘솔 에러 0
```

## 배포하다 넘어진 것 여섯 — 전부 저장소에 굳혔다

손으로 rsync 하며 하나씩 터졌다. **여섯 다 "설치 검사는 통과하고 실행할 때만 죽는" 모양**이라,
고친 자리를 코드에 남기지 않으면 다음 사람이 같은 순서로 다시 밟는다.

| # | 증상 | 뿌리 | 고친 곳 |
|---|---|---|---|
| ① | ROS 소싱에서 즉사 | `setup.bash` 가 `AMENT_TRACE_SETUP_FILES` 를 **검사만** 하는데 우리가 `set -u` 로 태웠다 | `tb-run.sh` — 남의 스크립트는 `set +u` 로 감싼다 |
| ② | `No module named numpy` | venv 가 깨끗해서. rclpy 는 PYTHONPATH 로 오는데 **그 안의 메시지 패키지가 시스템 numpy 를 import** 한다 | `tb-setup.sh` — `--system-site-packages` (2026-08-03 에 돌던 venv 도 이거였다) |
| ③ | 브리지는 뜨는데 **로봇 0대** | `requirements.txt` 가 `uvicorn` — `/ws/state` 만 404. 상태가 WS 로만 와서 화면이 조용히 빈다. **dev 는 `uv run --with 'uvicorn[standard]'` 라 안 보였다** | `requirements.txt` — `uvicorn[standard]` |
| ④ | venv 가 **통째로 사라졌다** | `fr5-ubuntu.sh` 의 `rsync --delete` — 보낸 적 없는 것도 지운다. **FR5 배포가 터틀봇을 죽인다** | `fr5-ubuntu.sh` — `.venv` · `TurtleBot/bridge/data` 제외 |
| ⑤ | 배포 스크립트가 ssh 255 | `pkill -f 'uvicorn …--port 5056'` 패턴이 **원격 셸 자신의 명령줄**에 걸려 스스로를 죽였다 | `[u]vicorn` (그리고 ⑥ 으로 pkill 자체를 없앴다) |
| ⑥ | 배포가 **몇 분씩 매달린다** | `ssh host "… &"` 로 데몬을 만들려 했다. 끊으면 exec 전에 죽고, 붙잡으면 채널이 안 닫힌다 | **systemd `--user tb-bridge` 신설** (`tb-service.sh`) — FR5 가 systemd 인 이유와 같은 자리. GAP 의 "tb-bridge 감시 없음" 도 같이 닫힌다 |

`scripts/deploy/tb-ubuntu.sh` 를 새로 만들어 위를 전부 담았다 — **8.8초**에 끝난다.
호스트의 `~/start-bridge.sh` 도 갈아 끼웠다: 옛 판은 `pkill -f 'uvicorn main:app'` 로
**FR5 브리지까지 죽이고** 5055 를 손으로 박고 있었다 (옛 판은 `.old-5055` 로 남겼다).

## 치운 것

맥에서 mock 을 돌린 실험 기록 3건이 rsync 를 타고 실기 기록에 섞였다(`source: mock`).
호스트·맥 양쪽에서 지우고, 배포 스크립트가 `bridge/data` 를 아예 안 보내게 했다.

## 다음

1. **팀 공지** — 여는 주소가 `:5055` → **`:5056`**
2. 로봇 2대 bringup (사람·현장) → `ros_domain_id` 실기 대조
3. 위 빨강 2건 — 화면이 왜 안 채우는지
