# 게이트가 초록이었던 이유 — 절반을 안 세고 있었다

분류: **증거**. 2026-08-05 밤. `/감사` 다역할 병렬 심사(4역할) + 메인 직접 검증.
표적은 핸드오프가 준 둘(`motionQueueLength` · 손으로 안 눌러 본 UI)이었고, 그 둘을 파다가
**게이트 자체가 반만 돌고 있었다는 것**이 나왔다.

주인님 판정 — **이번 턴은 등재만 한다. 코드는 안 고친다.**

## 결론

`bash scripts/check/all.sh` 의 "전체 통과"에 **실렌더 검증이 통째로 빠져 있다.**

`all.sh:11` 의 순회 대상은 `"$HERE"/*.sh` 와 `"$HERE"/../*/check-*.sh` 뿐이다.
`.mjs` 로 된 검증기 7개는 어느 `.sh` 도 부르지 않는다 — `grep -rn "mjs" scripts/check/*.sh
scripts/*/check-*.sh` 는 `config.mjs --check`(빌드 산출물 대조)와 주석·정규식 세 줄만 낸다.

오늘 실행 로그로 대조했다. 실제로 돈 것은 `.sh` **16개**이고, 로그 전체에서 `mjs`·`실렌더`
문자열은 **0건**이다.

| 핸드오프가 적은 숫자 | 어디서 나오나 |
|---|---|
| 단위 106 | `check/fr5-unit.sh` — **`all.sh` 가 돈다** (로그에 `Ran 106 tests`) |
| 브리지 82 | `check/fr5-bridge-verify.mjs` — 사람이 따로 불러야 한다 |
| 실렌더 46 | `check/fr5-web-verify.mjs` — 사람이 따로 불러야 한다 |
| (배치 113 · 관제 17/28 · 카메라 12) | `dash-web-verify.mjs` · `cam-web-verify.mjs` — 같다 |

즉 세 숫자 중 하나만 자동이다. 나머지를 안 부르고 마감하면 게이트는 **모른 채 초록**을 낸다.
2026-08-04 의 "실렌더 게이트가 자기 크래시를 삼켰다" 와 같은 계열이고, 그때는 게이트 **안**이
눈멀었다면 이번은 게이트가 **그 파일을 아예 안 집는다**.

## P0 — 넷. 전부 원본 또는 실행으로 확인했다

### 1. 자동 게이트가 실렌더·통합 검증을 안 집는다

`scripts/check/all.sh:11`. 위 결론 그대로. 판정 근거는 실행 로그 대조이지 코드 독해가 아니다.

### 2. 궤적 이름이 그대로 파일 경로가 된다

`FR5/bridge/teach.py:275` 의 검증은 `if not name` 한 줄이고, `teach.py:144` 가
`self._dir / f"{traj['name']}.json"` 로 쓴다. `pathlib` 은 오른쪽이 절대경로면 왼쪽을 버린다.

실제로 돌려 봤다:

```
'ok'                      -> /home/x/fr5-data/trajectories/ok.json
'../../../etc/cron.d/pwn' -> /home/x/fr5-data/trajectories/../../../etc/cron.d/pwn.json
'/etc/cron.d/pwn'         -> /etc/cron.d/pwn.json          ← base 가 통째로 버려진다
```

조종권을 잡고 `POST /trajectories/start` → `stop` 두 번이면 **브리지 계정이 쓸 수 있는 모든
파일**을 `.json` 내용으로 덮어쓴다. 로봇은 1도도 안 움직여도 된다. `ARMED` 도 필요 없다
(계약 §궤적이 "조종권 · ARMED 불필요"로 정한 대로다 — 그 완화가 이 구멍의 문턱을 낮춘다).

읽기 쪽(`teach.py:138`)도 같은 모양이지만 접미사가 `.json` 으로 고정이라 영향이 작다.
`PointStore` 는 이름이 JSON 필드로만 가고 파일명이 안 되므로 무관하다.

처방: 저장·조회 직전 `^[A-Za-z0-9가-힣_-]{1,64}$` 화이트리스트 + `resolve()` 가
`self._dir.resolve()` 하위인지 재확인. 고칠 곳은 `TrajectoryStore.save`·`get` 두 곳이다.

### 3. `NaN` 이 안전 설정 대조를 조용히 통과한다

`FR5/bridge/session.py:165`:

```python
if got is None or abs(got - float(settings["payloadKg"])) > SETTING_TOL["payloadKg"]:
```

`abs(nan - 0.6) > 0.05` 은 파이썬에서 **`False`** 다. `nan is None` 도 거짓이다.
그래서 되읽기가 `NaN` 이면 `mismatch` 가 비고, `apply_settings` 는 예외를 안 던지고,
조건 26(설정이 실제로 걸렸나)이 통과한다. `cogMm` 도 같은 모양이다(`session.py:168`).

결과: **말단 하중과 무게중심이 로봇에 안 들어간 채 ARM 될 수 있다.** 그 둘은
`fairino.py:210` 이 "하중이 먼저다 — 없으면 충돌 감지가 오작동한다"고 적어 둔 바로 그 값이다.

처방: 비교 전에 `math.isfinite()` 를 확인하고, 아니면 결측과 같이 `mismatch` 에 올린다.

### 4. 지점 삭제가 확인도 되돌리기도 없다

`FR5/src/features/teach/TeachPanel.jsx:41`. `confirm` 은 파일 전체에 0건이고,
`LayoutEditor` 와 달리 되돌리기 스택이 없다 — 지우면 끝이다.

바로 윗줄(`:38`)이 **실기를 그 자세로 움직이는 "이동"** 버튼이고, 둘은 `margin-left: 4px`
로 붙어 있다. `main.css:137` 의 `padding: 6px 12px` · `font-size: 12px` 면 세로가 약 29px
로 권장 터치 크기(44px) 아래다. 폰에서 목록을 스크롤하다 잘못 짚기 쉬운 배치다.

## P1 — 열여섯

| # | 위치 | 결함 |
|---|---|---|
| 1 | `robot_adapter/fairino.py:156` | `read_state()` 가 SDK 의 `robot_state`(운동상태 1정지/2운행/3일시정지/4드래그 · `Robot.py:65`)·`motion_done`(도착신호 `:93`)·`actual_qd`(관절속도 `:72`)를 **안 읽는다.** 조건 6·`EXECUTING`·드리프트 검사가 전부 `mc_queue_len` 하나에 매달려 있다 — **표적 ① 의 근원** |
| 2 | `commands.py:67` | 그래서 이동 직후 진단 로그의 `robotState`·`programState`·`motionDone` 이 **항상 `None`**. 어제 "이동 중에도 0" 관측의 절반이 계측 오류다 |
| 3 | `commands.py:129` | 같은 계열 신규 — 그리퍼 활성화 로그의 `activeRaw`·`faultRaw`·`pctRaw` 도 대응 키가 어댑터에 없어 **처음부터 전부 `None`** |
| 4 | `fairino.py:256` ↔ `base.py:56` | `forward_kin` 이 계약("못 구하면 `None`")과 달리 `_guard` 예외를 그대로 던진다. 호출부(`commands.py:53·81·180`)는 `None` 만 대비 — 작업영역 게이트 밖으로 예외가 샌다 |
| 5 | `session.py:78` | `read_fresh_state()` 가 어댑터 예외를 안 잡는다. 연결이 오염되면 명령 경로에서 `fail_closed()` 로 못 간다 — 형제인 `fresh_state()`·`snapshot()` 은 잡는다 |
| 6 | `fairino.py:87` | 최초 연결검증 `GetSoftwareVersion()` 만 `_guard` 3초 상한 밖이다. 소켓 타임아웃이 `None` 으로 복귀한 직후라 걸리면 무한 대기 |
| 7 | `owner.py:71` ↔ `main.py:158` | `_disconnected_at` 은 WS 종료에서만 채워지는데 HTTP `claim` 은 `session_open` 을 안 부른다. **WS 를 안 연 클라이언트가 조종권을 잡으면 reaper 가 영원히 못 잡는다** — 서버 재시작 외 복구 없음 |
| 8 | `main.py` 전역 | `CORSMiddleware`·Origin 검사 0건. WS 는 동일출처 정책 대상이 아니라 **임의 웹페이지가 `ws://브리지/ws/state` 를 열어 명령을 쏠 수 있다.** LAN 신뢰 전제를 "인터넷 임의 사이트"까지 넓힌다 |
| 9 | `live/LivePanel.jsx:69` | `run()` 에 `try/finally` 가 없다. fetch 가 던지면 `busy` 가 영구 `true` — 새로고침 전까지 모든 조작 버튼이 죽는다. 형제 `TeachPanel.jsx:102` 는 `finally` 를 쓴다 |
| 10 | `live/LivePanel.jsx:57` | `getRobots()`·`getVersion()` 에 `.catch` 가 없다. 브리지가 안 떠 있으면 드롭다운이 빈 채 멈추고 연결 버튼이 영원히 비활성인데 **이유를 화면이 안 말한다** |
| 11 | `live/LivePanel.jsx:159` | 조그 버튼만 `busy` 잠금이 없다. 다른 실기 명령 버튼은 전부 `disabled={busy}` 인데 여기만 매 클릭이 즉시 WS 로 나간다 |
| 12 | `layout/LayoutView.jsx:817` · `lab/interaction.js:521` | 부품 "복제"가 우클릭 메뉴·`Ctrl+D` 에만 있다. 캔버스가 `touchAction:'none'` 이라 폰 long-press 로 컨텍스트 메뉴가 안 뜬다. 같은 화면의 "90° 회전"은 폰용 버튼을 따로 뒀는데 복제는 없다 |
| 13 | `screens/main.jsx:50` 외 4곳 | 버튼이 **왜** 비활성인지를 `title` 툴팁으로만 알린다. 폰은 hover 가 없어 절대 안 뜬다 |
| 14 | `screens/main.css:33` | 상시 안전바의 STOP·모드토글 세로가 약 26px. 이 화면에서 유일하게 항상 떠 있는 정지 수단이다 |
| 15 | `scripts/deploy/fr5-ubuntu.sh:27` | 로봇 재연결(`POST /connect`)이 실패해도 `*)` 분기가 echo 만 하고 그대로 `배포 OK` 를 찍는다 — **절반만 된 배포가 성공을 보고한다** |
| 16 | `scripts/README.md:9`, `scripts/robot/tb-run.sh:15` | README 의 `check/` 트리가 실제 자동 게이트 구성과 어긋난다(P0-1 과 같은 뿌리) · tb-bridge 는 `exec uvicorn` 뿐이라 죽어도 아무도 모른다(FR5 는 systemd) |

## P2 — 아홉

`session.py:150` 이 `missing` 을 클라이언트로 보내기 직전 지운다(계약 §250 과 불일치, 죽은 필드) ·
지점·궤적 이름 길이와 개수에 상한이 없다 ·
`main.py:118·189` 가 예외 문구를 그대로 반환 ·
`tb-*.mjs` 4개가 `catch` 없이 `try/finally` 만 — 2026-08-04 수정이 형제 호출처에 안 퍼졌다 ·
`skills.sh:65` 가 pyyaml 없으면 YAML 파싱 검사를 WARN 으로 강등 ·
`map/check-calib.sh:14` 는 측정 파일이 없으면 0건 PASS(의도된 소프트 패스 — 기록만) ·
`scripts/README.md:123` 의 `fr5-unit.sh` 기준값 "29 케이스"가 실측 106 과 다르다 ·
`RobotTwin.jsx:53` 이 URDF 로딩 실패를 콘솔에도 화면에도 안 남긴다 ·
`LayoutEditor.jsx:829` 의 "배치안 삭제"가 확인 없이 즉시 실행.

## 기존 등재 항목의 재확인 (신규 아님)

- **`CAP_*` 를 `consts.sh` 가 안 본다** — 대조 표를 이번에 전수로 냈다. 대조되는 상수는 5그룹,
  선언만 되고 안 보는 것이 **10그룹**(`docs-weight.sh` 의 `CAP_*` 전부 + `map/make-tags.py` ·
  `map/aim.py` · `assets/make-marker-sheet.py` · `build/config.mjs` 상수)
- **팔레트 232px 고정** — `Dashboard/src/screens/main.css:286`. 같은 파일의
  `.view3d-tools`·`.pose-edit`·`.timeline` 은 `@media (max-width: 820px)` 오버라이드가 있는데
  `.palette` 만 없다는 것까지 확인
- **주인 없이 ARMED** — 오늘도 그대로였다. 붙자마자 `phase: ARMED · owner: admin · 서보 ON`.
  무활동 자동 disarm 이 없어 세션이 끝나도 남는다 (주인님이 사용 중이라 내리지 않았다)

## 이번에 실측한 것

- 살아 있는 브리지 `GET /state` 1회 — 위 ARMED 관측과, 응답에 `robotState`·`programState`·
  로봇 `motionDone` 이 **없다**는 것 확인. `coord` 가 `tool1/user1` 인데
  `appliedSettings.sent.toolCoordId` 는 `0` 이라는 기존 갭도 살아 있다
- `bash scripts/check/all.sh` → **exit 0** (soft 경고 18건, 전부 문서 무게). 이 로그가
  P0-1 의 근거다
- `pathlib` 경로 결합 3케이스 · `abs(nan-x) > tol` — 파이썬으로 직접 실행

## 다음

고치는 순서는 **P0-1 이 먼저다.** 나머지를 고쳐도 그것을 확인해 줄 게이트가 반만 돌면
회귀를 못 잡는다. `all.sh` 가 `.mjs` 를 집게 하고 나서 2·3·4 로 간다.

표적 ① 의 실측(`robot_state` 가 이동 중 `2` 로 뜨는가)은 **로봇을 움직여야** 확정된다.
정지 상태로는 못 본다.
