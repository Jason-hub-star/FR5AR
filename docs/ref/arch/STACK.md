# STACK — 확정 기술과 버전

분류: **SSOT**. 라이브러리를 고르거나 버전을 올릴 때 여기를 먼저 고친다.
최종 확인 2026-07-29 (npm·PyPI 레지스트리 및 GitHub API 직접 조회).

## 층별 확정

| 층 | 선택 | 버전 | 근거 |
|---|---|---|---|
| 폰 카메라 정합 | AR.js | `@ar-js-org/ar.js` 3.4.8 | iOS·안드로이드 양쪽에서 되는 유일한 방식 |
| 3D 렌더 | three.js | 0.185.1 | — |
| 로봇 모델 로딩 | urdf-loader | 0.13.1 | STL을 기본 지원 → 우리 URDF 그대로 사용 |
| 궤적 계산 | 정기구학(FK) 보간 | 자체 | IK 불필요 — §궤적 참조 |
| 서버 | FastAPI + uvicorn | 0.140.13 / 0.52.0 | — |
| 로봇 통신 | Fairino 공식 파이썬 SDK | GitHub 배포 | **PyPI에 없음** — §함정 참조 |
| 브라우저↔서버 | WebSocket | — | 양방향 필요, 100Hz 여유 |
| 뎁스카메라 | Intel RealSense D435 | — | 그리퍼 상단 장착 — §뎁스카메라 참조 |

React(`@react-three/fiber` 9.6.1)는 **화면이 복잡해진 뒤에** 도입한다. 처음엔 순수 three.js.

## AR — 마커 방식 (정본은 `AR-MARKER.md`)

iOS 사파리는 `immersive-ar`(WebXR)를 열어주지 않는다. 따라서 **카메라 영상을 직접 받아
마커를 찾는 방식**만 iOS·안드로이드 양쪽에서 동작한다.

마커 번호(#5 `110/110/110`)·인쇄 규격(A4 170mm)·검출 실측(**크기보다 흑백 명도차 130 이상이
먼저 깨진다**)은 **`docs/ref/arch/AR-MARKER.md`** 로 이관했다 (2026-08-04 · 문서 무게).

## 3D — 우리 자산 그대로 쓴다

원본: `FR5UNITY/robotapp/Assets/Runtime/Robots/FAIRINO_FR5/`

| 항목 | 값 |
|---|---|
| URDF | `fairino5_v6.urdf` (SolidWorks 내보내기) |
| 메시 | STL 7개 (base / shoulder / upperarm / forearm / wrist1~3) |
| 관절 | `j1`~`j6`, 전부 revolute |
| 삼각형 | 58,482 |
| 용량 | 12 MB |

```js
const loader = new URDFLoader();
loader.packages = { '': '/assets/FAIRINO_FR5' };
loader.load('/assets/FAIRINO_FR5/fairino5_v6.urdf', robot => {
  robot.rotation.x = -Math.PI / 2;          // ROS는 Z-up, three.js는 Y-up
  robot.setJointValue('j2', -1.0);          // 각도는 라디안
});
```

**STL은 비동기로 늦게 붙는다.** `load` 콜백 시점에는 메시가 아직 0개일 수 있다. 삼각형 수를 세거나 바운딩 박스를 잡는 코드는 콜백 안에서 하면 틀린다.

## 에셋 저작 — 무대 소품은 파일이 아니라 함수다 (2026-08-03 등재 · D51)

**로봇만 메시 파일이고, 무대 소품은 전부 절차적 코드다.** `Shared/view3d/parts.js` 에
three.js 프리미티브로 그리는 함수 18개가 있다 — `bench` `isolator` `shelf` `instrument`
`workstation` `benchRun` `wallCabinet` `safetyFence` `beacon` `crane` `worker` `ammoPallet`.
배치안은 `type` 문자열로 이 함수를 고른다.

그래서 **방산 무대 전환은 파일 교체가 아니라 함수 교체**다. `Shared/assets/` 는 안 늘고
`dist` 용량(GAP OPEN)도 안 변한다. 새 소품(컨베이어·탄두·정밀 지그·부품 랙·방폭 격벽)도
같은 자리에 함수로 더한다.

| 도구 | 주소 | 라이선스 | 무엇 | 검증 상태 |
|---|---|---|---|---|
| **img2threejs** | `github.com/img2threejs/img2threejs` | Apache-2.0 | 참조 이미지 → three.js 절차적 모델 코드 생성. Claude Code 스킬로 설치(`~/.claude/skills/`) | **주소·라이선스 확인 2026-08-03. 산출물 실사용 미검증** |

- **런타임 의존성이 아니다.** 저작 시점에만 돌고 산출물은 우리 코드가 된다.
  `package.json` 에 아무것도 안 들어간다 — 기존 "새 의존성 0" 경계를 안 깬다
- **산출물이 TypeScript 다.** 우리 저장소는 순수 JS 라(`*.ts` 0개) **JS 로 옮겨
  `parts.js` 규약에 맞춘 뒤** 커밋한다. 생성 코드를 그대로 붙이지 않는다
- 대안으로 harness 에 `blender-procedural-glb`·`step-to-glb` 스킬도 있다. **그쪽은 GLB 파일을
  낳으므로 용량이 는다** — 지금 무대 소품에는 절차적 코드가 맞다

## 그리퍼 — URDF에 없다. 확장해야 한다

원본: `FR5UNITY/robotapp/Assets/Runtime/EndEffectors/PGEA_100_40/Source/`
사본: `Shared/assets/PGEA_100_40/` (2026-07-29 복사 완료)

**`fairino5_v6.urdf`에는 팔 링크 7개만 있고 그리퍼가 없다.** 웹에서 그리퍼를 보이려면
링크 3개(`gripper_body`, `finger_left`, `finger_right`)와 **prismatic 관절 2개**를 URDF에 덧붙여야 한다.
손가락은 회전이 아니라 **직선으로 벌어진다** — 유니티 쪽 `FR5EndEffectorAttachment.cs`가
`fingerLeftClosed`/`fingerRightClosed`를 `Vector3` 위치로 들고 있는 것이 근거다.

| 파일 | 삼각형 | 용량 | 비고 |
|---|---|---|---|
| `PGEA-100-40_body.stl` | 61,774 | 3.0 MB | **전체의 절반. 1순위 경량화 대상** |
| `PGEA-100-40_finger_left.stl` | 4,164 | 203 KB | |
| `PGEA-100-40_finger_right.stl` | 4,164 | 203 KB | |
| (미복사) `PGEA-100-40.stl` | 29,037 | 7.8 MB | 통합 ASCII. 저폴리지만 손가락이 안 움직임 |

**합계 — 팔 58,482 + 그리퍼 70,102 = 128,584 삼각형 / 6.13 MB.**

경량화는 **삼각형 수를 줄이는 것뿐이다.** STL 3개는 이미 **바이너리**라
(2.9MB ÷ 61,774 = 삼각형당 50바이트, 바이너리 STL의 이론 최소치) 형식 변환으로 줄일 여지가 없다.
순서를 정하면 그리퍼 몸통부터다 — 이것 하나만 줄여도 절반이 준다.

### 단위가 팔과 다르다 — 밀리미터다

2026-07-30 STL 3개를 직접 파싱해 확인. **그냥 붙이면 1000배로 뜬다.**

| | 팔 (`FAIRINO_FR5`) | 그리퍼 (`PGEA_100_40`) |
|---|---|---|
| 단위 | **미터** (`base_link` 149mm → `0.149`) | **밀리미터** (body 79.4 × 132.0 × 29.0) |
| URDF `scale` | 없음 (= 1) | URDF에 아예 없음 |

→ three.js에 붙일 때 `scale.setScalar(0.001)`. 변환 지점은 한 곳뿐이다 (하드 룰 5).

### 세 조각의 상대 위치는 이미 맞다

세 STL이 **같은 조립 좌표계**에 구워져 있다 (min Z가 셋 다 −334~−340mm 부근,
손가락은 X축 대칭: 왼쪽 X −16.9~36.9 / 오른쪽 −36.9~16.9).
→ body와 손가락의 상대 배치를 계산할 필요가 없다. **한 `Group`에 넣으면 조립된다.**

### 모르는 것 둘 — 계산하지 말고 눈으로 맞춘다

| 모르는 값 | 지금 아는 것 | 확정 방법 |
|---|---|---|
| 축 방향 | 돌출 방향이 **+Y**, 손가락 개폐가 **X**. URDF 공구 관례는 접근 방향 +Z → X축 −90° 회전으로 **추정** | 3D 뷰에서 육안 정합 |
| `wrist3_link` → 그리퍼 원점 | `wrist3_link` 메시가 자기 원점에서 Z **53.2~99.0mm**에 있다. 플랜지 면이 어느 쪽인지 URDF만으로는 못 정한다 | 같음 |

**URDF를 읽어 삼각함수로 유도하지 않는다** — 틀린 값을 확신하게 된다.
확정값은 `Shared/data/config/gripper-mount.json`에 `verified` 플래그와 함께 둔다.
유니티 프리팹에 값이 있으면 그것으로 검증한다.

## 뎁스카메라 — RealSense D435 (2026-08-04 등재 · 데이터시트 확인 · 실기 미검증)

**확정 — Intel RealSense D435.** 그리퍼 **상단**(핑거 위)에 외장 브래킷으로 얹고 **아래를 본다**.
조사 단계 1순위였던 D405 는 쓰지 않는다 — 실물이 D435 다
(`docs/research/vision-imitation.md` §3 정정됨).

### Min-Z 는 고정값이 아니라 **깊이 해상도의 함수**다

이 표가 이 카메라를 손목에서 쓸 수 있게 만드는 근거다. 최대 해상도 행만 보고
"28cm 라 근접 작업엔 못 쓴다" 로 끝내면 틀린다.

| 깊이 해상도 | Min-Z | 손끝(TCP) 기준 깊이 사각지대 시작 |
|---|---|---|
| 1280×720 | 280mm | 25cm |
| 848×480 | 195mm | 16.5cm |
| 640×480 | 175mm | 14.5cm |
| 640×360 | 150mm | 12cm |
| 480×270 | 120mm | 9cm |
| **424×240** | **105mm** | **7.5cm** |

출처: **Intel RealSense D400 Series Datasheet 337029-017, Table 4-11** (D430/D435/D435i 열).

오른쪽 열은 `Min-Z − 렌즈~TCP 거리`. **렌즈~TCP 를 30mm 로 잡은 것은 아직 추정이다** —
핑거 24mm + 브래킷 포함 카메라 높이 29mm 에서 유도했다. **실측으로 대체한다.**

### 그래서 이렇게 쓴다

| 구간 | 깊이 해상도 | 왜 |
|---|---|---|
| 접근 (30cm~) | 848×480 | 시야·정밀도 확보. **여기서 물체를 재고 앵커를 뜬다** |
| 근접 | **424×240**(USB3) · **480×270**(USB2 대체) | Min-Z 를 105mm·120mm 까지 낮춰 사각지대를 줄인다 |
| 파지 순간 | 깊이 없음 · **RGB 만** | 사각지대. ACT·Diffusion Policy 는 픽셀로 판단하므로 RGB 로 족하다 |

### USB2 에서 무엇이 잘리나 (2026-08-04 실측)

맥에 D435(S/N 254522075185 · 펌웨어 5.17.0.10)를 물려 `rs-enumerate-devices` 로 직접 뽑았다.
장치 기술자가 **`Usb Type Descriptor: 2.1`** — USB2 로 열거된 상태의 목록이다.

| 깊이 모드 | USB2 fps | Min-Z | 손끝 사각지대 |
|---|---|---|---|
| 1280×720 | **6** | 280mm | 25cm |
| 848×480 | **10**/8/6 | 195mm | 16.5cm |
| 640×480 | 30/15/6 | 175mm | 14.5cm |
| 640×360 | 30 | 150mm | 12cm |
| 480×270 | **60**/30/15/6 | 120mm | 9cm |
| 256×144 | 90 | **미상** (Table 4-11 에 없음) | 실측 대상 |
| ~~424×240~~ | **목록에 없음** | 105mm | — |

**판정 둘**

- **A축(인식 → 제안)은 USB2 로도 착수 가능하다.** 앵커는 좋은 프레임 한 장이면 되므로
  접근 848×480@10Hz · 근접 480×270@60Hz 로 충분하다. 사각지대가 7.5cm → **9cm** 로
  1.5cm 늘 뿐이다
- **B축(모방학습)은 USB3 가 필요하다.** 정책은 10~50Hz 관측을 요구하는데 848×480 이
  10Hz 에서 막힌다. **케이블 교체는 B축의 선행 조건이지 A축의 블로커가 아니다**

256×144@90Hz 는 Min-Z 가 데이터시트 표에 없다. 사각지대를 더 줄일 여지가 있으니
**실물에서 재본다** — 카메라를 그리퍼에 올린 뒤 30분짜리 킬실험이다.

424×240 · 거리 105mm 에서 화각(HFOV 87°) 기준 가로 약 199mm 가 424px 에 담긴다 —
**0.47mm/px**. 페트병 뚜껑(지름 ~30mm)이 64px 로 잡히므로 위치 측정에 충분하다.

**손목캠 실시간 mm 재정렬(closed-loop)은 이 하드웨어로 불가능하다.** 마지막 7.5cm 는 눈을 감고
내려간다. 그 구간은 `/proposal` 의 `anchorPose`·`validUntil` 로 봉인한다
(`ARCHITECTURE.md` §비전 · `research/vision-imitation.md` §5).

### 딸려 오는 조건 둘

- **말단 하중을 다시 설정해야 한다** — 카메라 무게만이 아니라 **무게중심 오프셋**까지.
  카메라가 그리퍼 폭 밖으로 튀어나와 무게중심이 툴 축 위에 없다. 질량만 넣고 오프셋을
  빠뜨리면 **드래그 티칭과 충돌 감지가 조용히 망가진다** (`SAFETY-RULES.md` 조건 4·5·25)
- **뚜껑 체결은 재파지 사이클이다** — 뚜껑은 1~1.5 회전(360~540°)이 필요한데 J6 는 **±175°**
  (컨트롤러 실측 · §FR5 실기 Python SDK)라 최대 350° 다. 한 번의 연속 회전으로 끝낼 수 없다.
  "조인다 → 그리퍼 열기 → J6 되돌리기 → 다시 잡기" 로 설계하고, **시연도 이 사이클로 찍는다.**
  케이블 감김도 이때 같이 풀린다

### 아직 안 정한 것 (2026-08-04 보류)

- **호스트를 어디에 두나** — 손목 파이 / 팔 밑동 파이 / 우분투 브리지 PC 직결 / PoE 급전 파이.
  전원·배선을 실물로 확인한 뒤 정한다. **D48 개정 여부가 여기 달렸다**
- 렌즈~TCP 실측 거리 · 손가락이 가리는 화면 범위 · 카메라+브래킷 실제 무게
- 케이블 등급 — 우분투 PC 까지 실거리에 따라 수동 USB3(~3m) / 액티브 / PoE 가 갈린다
- ~~USB2 폴백이 감당하는지~~ → **해소** (2026-08-04 실측 · 위 §USB2 에서 무엇이 잘리나).
  남은 것은 **256×144 의 Min-Z 실측**과 USB3 연결 시 모드 목록 재확인

## 궤적 — 역기구학(IK) 없이 된다

저장된 이동 지점은 **손끝 위치가 아니라 6축 관절 각도**이고, MoveJ는 그 각도를 직접 보간한다.
따라서 시작 각도 → 끝 각도를 잘게 나눠 각 단계마다 FK를 돌리면 손끝이 지나는 점들이 나온다.

```python
def preview_path(q_from, q_to, steps=100):
    return [forward_kinematics([a + (b - a) * (k / steps)
                                for a, b in zip(q_from, q_to)])
            for k in range(steps + 1)]
```

브라우저에서도 같은 계산이 가능하다 — urdf-loader가 관절 트리를 그대로 들고 있으므로
`setJointValue` 후 `getWorldPosition`을 읽으면 된다. **2026-07-29 실렌더로 검증됨**
(`docs/evidence/2026-07-29/urdf-web-render.md`).

이 궤적은 **예상값**이다. 실제 로봇은 가감속과 안전 제한 때문에 다르게 움직인다.
화면에 "예상 경로"라고 표기하고, 실제 지나간 길은 로봇이 보내는 관절값으로 따로 그린다.

## 함정 — 먼저 알고 시작할 것

| 함정 | 증상 | 대응 |
|---|---|---|
| **HTTPS 없이 카메라 안 열림** | 폰에서 `http://192.168.x.x` 접속 시 카메라 요청 자체가 안 뜸 | 코드 짜기 전에 mkcert 또는 터널부터 세운다 |
| **Fairino SDK가 PyPI에 없음** | `pip install fairino` 실패 | 공식 저장소에서 받는다. 최신 파이썬에서 설치가 막히면 pip 패치본 참고 |
| **three.js 빌드가 둘로 쪼개짐** | `three.module.js`만 받으면 `three.core.js` 404 | r185부터 두 파일. CDN 대신 번들러를 쓰면 자동 해결 |
| **마커 떨림** | 겹쳐진 로봇이 덜덜 떨림 | 최근 프레임 평균, 마커 놓쳐도 마지막 위치 유지 |
| **단위 두 번 어긋남** | 로봇이 엉뚱한 자세 | 미터·라디안 ↔ 밀리미터·도 변환을 한 곳에만 둔다 |

## 참고할 남의 코드

| 저장소 | 왜 |
|---|---|
| `FAIR-INNOVATION/fairino-python-sdk` | 공식 파이썬 SDK — 우리 서버의 뒷단 |
| `meowiky/DP-fairino-robot-API` | FR5를 REST로 감싼 최소 예시 |
| `jjh1214/fairino_sim` | 우리와 같은 ROS 2 Jazzy 조합, 코드가 작아 읽기 쉬움 |
| `123CHENJINHUA/rebar-tying` | 카메라·로봇 위치 맞추기 구현이 통째로 있음 |
| `gkjohnson/urdf-loaders` | 우리가 쓰는 로더의 본체와 예제 |

## 관제화면 (Dashboard) — 2026-07-30 등재

`/스택가드` 규약대로 **코드에 박기 전에 여기 등재**한다. 아래는 실제 설치본이다.

| 패키지 | 버전 | 왜 |
|---|---|---|
| `react` · `react-dom` | **19.2.8** | 배치안 편집 + 지표 비교는 화면이 복잡해지는 시점이다 (D17) |
| `@vitejs/plugin-react` | **5.2.0** | Vite React 플러그인 |
| `vite` | 8.1.5 | AR 과 같은 버전. workspaces 로 묶여 있다 |
| `three` | 0.185.1 | 배치안 3D. **R3F 는 쓰지 않는다** — `Shared/view3d/` 를 ref 로 마운트 (D17) |

**안 넣은 것** — 상태관리 · 라우터 · 차트 · UI 프레임워크.
필요해진 뒤에 넣는다. 미리 넣은 의존성은 나중에 빼기 어렵다 (`CONSOLE-REACT.md` §의존성).

**실측 (2026-07-30 골격)** — 빌드 통과. JS **60KB gzip** · CSS 1.9KB.
`ar-threex`(1.6MB)가 **번들에 안 실린다**는 것을 확인했다 — 폴더 분리가 실제로 작동한다.

## FR5 실기 Python SDK — 2026-07-31 등재 (D42 · 현행)

| 항목 | 값 | 검증 상태 |
|---|---|---|
| SDK | `fairino-python-sdk` **v2.2.3_robot3.9.3** (Apache-2.0) — `FR5/bridge/robot_adapter/fairino_sdk/` 벤더링 | 실기 첫 조그 성공 |
| 구현 | **순수 표준 라이브러리** — xmlrpc(20003) 명령 + socket(20004) 실시간 `RobotStatePkg` | 원본 import 전수 확인 |
| 실기 정체 | 모델 `FR5-V1-002(V6.0)` · 웹 `v3.9.3.1` · 컨트롤러 `V3.9.15-QX` (`GetSoftwareVersion`) | 실측 — 프로필 검증값 |
| 함정 | xmlrpc 연결 1개·동시성 취약 → 어댑터 단일 잠금. 브리지 밖 병행 접속 금지 | Request-sent 실측 |
| 함정 | `robot_state_pkg` 는 첫 프레임 전엔 **클래스**다 — 인스턴스 확인 후 사용 | 원본 확인 |

## 로봇 안전 설정 API — 2026-08-04 등재 (소스 확인 · 실기 미검증)

**왜 여기 있나** — 우리 안전 게이트(조건 4·5·25)는 컨트롤러가 설정돼 있어야 값을 준다.
공식 매뉴얼 대조에서 그 설정이 전혀 안 돼 있는 것이 드러났다 (`SAFETY-RULES.md` §설정이 전제다).
아래는 벤더링 `Robot.py` 소스에서 직접 읽은 시그니처다. **넣는 것과 되읽는 것을 갈라 적는다.**

| 넣는다 | 인자 의미 | 되읽는다 |
|---|---|---|
| `SetAnticollision(mode, level[6], config)` | mode 0=등급(**1~10, 작을수록 민감**)·1=퍼센트(0~100) · config 1=설정파일 갱신(재부팅 후 유지) | **없음** |
| `SetCollisionStrategy(strategy, safeTime=1000, safeDistance=100, safeVel=250, safetyMargin=[10]*6)` | strategy 0=에러후정지·1=계속·2=에러정지·3=중력토크·4=진동응답·5=리바운드 · time[1000-2000]ms · dist[1-150]mm · vel[50-250]mm/s | **없음** |
| `SetCollisionDetectionMethod(method, thresholdMode)` | method 0=전류·1=이중엔코더·2=둘 다 · thresholdMode 0=등급 고정·1=사용자 정의 | **없음** |
| `SetStaticCollisionOnOff(status)` | 정지 상태에서의 충돌 검출 0=끔·1=켬 | **없음** |
| `SetLoadWeight(loadNum, weight)` | 말단 하중 [kg] | `GetTargetPayload(flag=1)` ✅ |
| `SetLoadCoord(x, y, z, loadNum=0)` | 무게중심 [mm] | `GetTargetPayloadCog(flag=1)` ✅ |
| `SetRobotInstallPos(method)` | 0=바닥·1=측면·2=천장 | **없음** (각도만 `GetRobotInstallAngle`) |
| `SetToolCoord(id[1~15], [x,y,z,rx,ry,rz], type, install, toolID, loadNum)` | 툴 중심점의 플랜지 기준 상대 위치 [mm][°] | `GetCurToolCoord` · `GetToolCoordWithID` ✅ |
| `SetPowerLimit(status, power)` | 출력 상한 [W] — 접촉 충격을 안전 기준 이하로 | **없음** |
| — | — | `GetJointSoftLimitDeg(flag=1)` → 12값 ✅ — **컨트롤러 소프트리밋을 읽어 우리 URDF 한계와 대조** |

⚠ **되읽기가 없는 항목이 절반이다.** 그래서 "설정했다"를 상태로 삼지 않고 **매 ARM 마다
다시 넣고, 넣은 값을 기록**한다 (조건 26). 그리고 소스가 **호출 가능 시점을 문서화하지 않는다** —
서보 ON·모드 조건이 주석에 없다. 실기에서 순서를 확정한다.

✅ `GetJointSoftLimitDeg` — 주석 단위가 mm 로 적혀 모순이었으나 **실기 실측으로 도(°)임을
확정했다** (2026-08-04). 컨트롤러 응답 `[-175,175, -265,85, -160,160, -265,85, -175,175, -175,175]`
가 우리 URDF 값과 j3 만 빼고 정확히 일치 — 우연일 수 없다. **j3 는 컨트롤러가 ±160 으로 더
좁아 우리 게이트를 그쪽에 맞췄다** (우리가 더 넓으면 컨트롤러가 거부할 목표를 통과시킨다).

✅ **`GetCurToolCoord` 실측 `[0, 0, 135, 0, 0, 0]`** (2026-08-04) — `toolCoordId 0` 인데
**Z 오프셋 135mm 가 이미 들어가 있다.** 즉 이 개체의 툴 0 은 "설정 없음" 이 아니라 누군가
그리퍼 길이를 넣어 둔 상태다. 화면 TCP 는 플랜지가 아니라 **그 오프셋이 적용된 값**이다 —
캘리브레이션 정확도는 미검증(누가 어떤 근거로 넣었는지 모른다).

**그리퍼 실물 사양 (대환 사양서 · 2026-08-04)** — 무게 **0.6 kg**(브레이크 유무 무관) ·
파지력 15~50N · 스트로크 40mm · 반복정밀도 ±0.02mm · 정격 20W · 24V DC · Modbus RTU(RS485) ·
권장 작업물 1kg. **페이로드 설정의 근거값이다.**

**로봇 사양 (공식 개요)** — 가반하중 5kg · 도달 922mm · 반복정밀도 ±0.03mm ·
**전 관절 최대 속도 180°/s** · TCP 통상 1m/s. → 서보 스트리밍 상한 30°/s 는 **1/6**이고,
컨트롤러 감속 모드 예시(36°/s)보다도 보수적이다.

## ~~FR5 실기 C# SDK 경로~~ — 폐기 (D41→D42 · 2026-07-31)

**쓰지 않는다.** macOS Mono 에서 xmlrpc 클라이언트가 쓰기마다 예외 → SDK 가 삼켜
가짜 성공/-4 반환 + 컨트롤러 xmlrpc 서비스까지 다운시켰다 (`evidence/2026-07-31/fr5-first-motion.md`).
아래 표는 당시 검증 기록으로만 남긴다.

`/스택가드` 규약 — 아래 호출명·시그니처는 추측이 아니라 **실기 readback 에 성공한
Unity `LiveFairinoClient.cs` 원본 대조**다 (evidence/2026-07-31/fr5-live-readback.md).

| 항목 | 값 | 검증 상태 |
|---|---|---|
| SDK | `libfairino.dll` C#SDK-V1.2.4 — 관리형 .NET 어셈블리 (네이티브 없음, System.Net.Sockets) | macOS Arm64 실기 readback 통과 |
| dll 위치 | `FR5UNITY/robotapp/Assets/Plugins/Fairino/libfairino.dll` — 저장소에 커밋 안 함, `FAIRINO_DLL` 환경변수로 참조 | `file` 로 확인 |
| 런타임 | **Unity 번들 Mono 6.13** (`…/6000.3.11f1/…/MonoBleedingEdge`) — dll 이 `DefineDynamicAssembly` 등 .NET Framework 전용 API 를 써서 **최신 dotnet 에선 안 돈다** (2026-07-31 실측). 컴파일도 같은 Mono 의 csc.exe (`fairino_cs/build.sh`) | 실기 readback 재통과 |
| 진입 클래스 | `fairino.Robot` — `Activator.CreateInstance` 후 인스턴스 메서드 | Unity 대조 |

| 호출 | 시그니처 (Unity 대조) | 용도 |
|---|---|---|
| `RPC(ip)` / `CloseRPC()` | 문자열 ip / 없음 | 연결·해제 (포트는 8080 고정, SDK 내부) |
| `GetSDKVersion` `GetSoftwareVersion` | out/ref 문자열류 — 리플렉션 후보 매칭 | 버전 |
| `GetRobotRealTimeState(ref ROBOT_STATE_PKG)` | 필드: `jt_cur_pos[6]` `tl_cur_pos[6]` `robot_mode` `mc_queue_len` `EmergencyStop` `collisionState` `rbtEnableState` 등 — **이름 후보 리스트로 읽고 없으면 결측 처리(fail-closed)** | 상태 |
| `GetSafetyCode()` | 반환 int | 안전코드 |
| `Set/GetRobotRealtimeStateSamplePeriod(int ms)` | 33 목표 | 폴링 주기 |
| `RobotEnable((byte)0/1)` | 실패 시 int 재시도 (Unity 폴백 그대로) | 서보 |
| `Mode(int)` 0=auto 1=manual | | 모드 |
| `DragTeachSwitch((byte)0/1)` | | 드래그 티칭 |
| `MoveJ(JointPos, tool, user, vel(f), acc(f), 100f, ExaxisPos, 0f, (byte)0, DescPose)` | 11인자 — `fairino.JointPos/ExaxisPos/DescPose` 생성도 리플렉션 | 조그(작은 delta)·이동 |
| `StopMotion()` | | 정지 |

**실측 추가 (2026-07-31 실기 전수 덤프)** —
- `ROBOT_STATE_PKG` 는 **78필드**. `cmdPointError`·`strangePosFlag`·드래그티칭 필드는 **없다**
  → 드리프트는 `lastServoTarget` 자체 계산(#9 대안), 드래그티칭은 `IsInDragTeach(ref byte)` 메서드
- `GetSoftwareVersion`/`GetFirmwareVersion` 은 code 0 인데 **빈 문자열**을 돌려준다 —
  모델·컨트롤러 문자열 검증은 불가. `GetSDKVersion` 만 "C#SDK-V1.2.4  Web-3.9.3" 반환
- SDK 가 **stdout 에 중국어 로그를 섞는다** — JSON-lines 소비자는 비JSON 줄을 버려야 한다

**오류코드 정본** — `manual.fairino.support` §Error Code (2026-07-31 대조):
`-4 = xmlrpc 인터페이스 실행 실패`(컨트롤러가 거부 — 펜던트 제어권·모드·안전회로 확인) ·
`-3 = xmlrpc 통신 실패` · `-2 = 컨트롤러 통신 이상` · `-1 = 기타`.
Unity `FairinoErrorTranslator` 의 `-4="비상정지"` 매핑은 **공식과 다르다** — 공식이 이긴다.

**서보 스트리밍 (2026-08-03 소스 확인 — 실기 미검증)** — 모방학습·원격조종처럼 목표를
연속으로 흘려보낼 때 쓴다. `MoveJ` 는 점 대 점이라 초당 수십 프레임을 못 받는다.

| 호출 | 시그니처·값 |
|---|---|
| `ServoMoveStart()` / `ServoMoveEnd()` | 스트리밍 구간을 여닫는다. **짝으로 부르지 않으면 다음 명령이 안 먹는다** |
| `ServoJ(joint_pos, axisPos, acc=0, vel=0, cmdT=0.008, filterT=0, gain=0, id=0)` | 관절 목표를 주기적으로 밀어 넣는다. `cmdT` 기본 **8ms**. 내부에서 `GetSafetyCode()` 선검사 |
| `ServoCart(mode, desc_pos, …)` | 직교 좌표판 — 우리는 안 쓴다 (역기구학 범위 밖, PRD) |

⚠ **게이트를 새로 써야 한다** — "한 명령당 5°" 는 점 대 점 전제다. 스트리밍은 각속도(°/s)로
바꿔 판정한다 (`SAFETY-RULES.md` §서보 스트리밍 상한).

**그리퍼 시그니처 (2026-08-03 벤더링 SDK `Robot.py` 소스로 확정 · 같은 날 실기 스모크 통과 — 아래 §스모크 실측)**

실물 펜던트 설정(주인님 실측): **제조업체 DAHUAN(대환) · 유형 PGI-140 · D1.0 · 말단 1번 포트**.
펜던트 4필드는 `SetGripperConfig` 인자와 1:1 이다.

| 호출 | 시그니처·값 |
|---|---|
| `SetGripperConfig(company, device, softversion=0, bus=0)` | **company 4=대환 · device 0=PGI-140** (대환의 유일한 선택지). softversion·bus 미사용 |
| `GetGripperConfig()` | → `(err, [number, company, device, softversion])` — **company·device 에 +1 보정돼 돌아온다** (SDK 소스) |
| `ActGripper(index, action)` | action 0=리셋 · 1=활성화 |
| `MoveGripper(index, pos, vel, force, maxtime, block, type, rotNum, rotVel, rotTorque)` | pos/vel/force 0~100% · maxtime 0~30000ms · block 0=블로킹 1=논블로킹 · type 0=평행(PGI-140) 1=회전 · rot* 는 회전형 전용(평행형은 0). 내부에서 `GetSafetyCode()` 선검사 |
| `GetGripperMotionDone()` | → `(err, [fault, status])` — status 1=완료 |
| `GetGripperCurPosition()` / `GetGripperActivateStatus()` | 20004 캐시(`gripper_position`·`gripper_fault`·`gripper_active`) 읽기 — xmlrpc 왕복 없음 |

**뚜껑 풀기·조이기의 회전은 그리퍼가 못 한다 (2026-08-03)** — 위 표대로 `type` 0=평행이고
`rotNum`·`rotVel`·`rotTorque` 는 **회전형 전용이라 우리 것은 0** 이다. 즉 뚜껑을 돌리는
회전은 **J6 축이 낸다.** 두 가지가 따라온다 — ①손목 카메라·그리퍼 케이블이 같은 방향으로
감긴다 (`docs/research/vision-imitation.md` §5) ②J6 회전 범위가 풀거나 조일 수 있는 바퀴수의 상한이다.
`force` 는 평행형에서도 살아 있다 — 잡는 힘의 상한이므로 반드시 준다 (`SAFETY-RULES.md` §그리퍼 힘 상한).

**정체 확정 (2026-08-03 실물 라벨 육안 확인)** — 실물은 **PGE A-100-40** 이다. 메시·장착값은
실물과 일치. 펜던트의 "PGI-140"은 SDK 대환 선택지가 그것 하나뿐이라 **빌려 쓰는 것** — 같은
Modbus 프로토콜로 동작한다 (스모크로 실증).

**스모크 실측 (2026-08-03 · 개폐 2회 육안 확인)** — 위 시그니처 전부 실기 통과. 단 주의 둘:
- **지령 pos% 와 읽기 pos% 의 방향이 반대다** — 지령 30 → 읽기 76, 지령 80 → 읽기 53(이동 중).
  구현 전에 방향·스케일 캘리브레이션 실측이 필요하다
- `GetGripperMotionDone` 이 이동 직후 `[1, 0]` 을 돌려준다 — 문서상 [fault, status] 인데
  fault=1 로 읽힌다. 필드 순서 오류 또는 실제 순서가 [status, fault]일 가능성 — 구현 때 재실측
