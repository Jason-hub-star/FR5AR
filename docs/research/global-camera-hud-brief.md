# 글로벌 카메라 HUD 구현 브리프

분류: **조사/구현 브리프**. 고급 모델이 이 문서를 보고 구현·검증한다.  
작성: 2026-08-06. 기반: `VISION-CONTRACT.md`, `LAYOUT-METRICS-CONTRACT.md`, `API-CONTRACT.md`, `ARCHITECTURE.md`, `GAP-MATRIX.md`, `FR5/src/features/live/CamView.jsx`, `Shared/data/config/global-cam.json`.

**검증·수정: 2026-08-06** — 원본을 열어 대조했고 아래를 고쳤다. 고친 이유는 각 절에 적혀 있다.

| 원본이 말한 것 | 실제 | 고친 곳 |
|---|---|---|
| CamView 에 90° 회전 없음 | **있다** (`main.css` `.cambody img`) | §1 · §9 · §7 단계 0 |
| `extrinsics.labToCam {R,t}` 스키마 | **최상위** `labToCam {rvec, tvecMm, …}` | §6.2 |
| 외부 RMS ≤ 0.5px | **≤ 2.0px** (0.5 는 내부 상한) | §7 |
| 손목 D435 관문이 있다 | **계약뿐** — 브리지 라우트 0건 | §1 |
| 공간 HUD 를 새로 설계 | `ar-global-camera.md` **§G2 승격** | §4.1 · §7.1 |
| — (누락) | CORS·왜곡·프레임 나이 전제 | §9 |
| — (누락) | 1080p 는 **순수 축소** → 재측정 불필요 | §9 · §7 단계 0a |

---

## BLUF

글로벌 카메라(폰 RGB) 위에 HUD를 추가한다. 첫 목표는 **proposal 검토창 + 객체 탐지 시각화 + 탄두 와우포인트**다. Dashboard는 아직 FR5 브리지를 읽지 않으므로 구현 위치는 **`FR5/src/features/live/`**이며, `CamView.jsx`를 기반으로 확장한다. D435 뎁스와는 역할이 분리된다.

**단, 그림보다 좌표 규약이 먼저다.** 해상도 쪽은 닫혔다 — 1080p 가 순수 축소로 확정돼 스케일 함수 하나면 된다(§7 단계 0a). **남은 것은 CSS 90° 회전 하나**이고, 이걸 두고 오버레이를 얹으면 중앙만 맞고 모서리가 338~587px 어긋난다 (§9 실측).

---

## 1. 현재 상태

| 항목 | 상태 | 근거 |
|---|---|---|
| proposal 계약 | 문서에만 존재 | `VISION-CONTRACT.md` 22-26행, 29-44행 |
| proposal 구현 | 0건 | `FR5/bridge/*.py`, `FR5/src/*`, `Dashboard/*`에서 `proposal\|/proposal` 0건 |
| 제안 고스트 소비자 | 없음 | `GAP-MATRIX.md` 82행 |
| 글로벌 카메라 내부 파라미터 | ✅ **재측정 완료 (2026-08-07)** | `fx 1728.17 · HFOV 73.05° · RMS 0.469px · 25장`. 옛 `fx 2106 · 62.6°` 는 근거 없는 값이었다 (`evidence/2026-08-07/global-cam-calibrated.md`) |
| 글로벌 카메라 외부 파라미터 | ✅ **있다 (2026-08-07)** | `labToCam` — 상판에서 0.75m · 하향 26.0° · 태그 4장 · RMS 0.82px. 원점은 상판 태그 id0 |
| 글로벌 카메라 스트림 | 브라우저가 폰 `/video` 직접 수신 | `FR5/src/data/datasource/http.js` 97-100행 |
| 손목 D435 관문 | **계약만** | `LAYOUT-METRICS-CONTRACT.md` 105-111행. 브리지 `.py`에 camera 라우트 **0건** — "관문이 있다"로 읽으면 안 된다 |
| Dashboard 브리지 연결 | **없음** | `GAP-MATRIX.md` 57행, `ARCHITECTURE.md` 188-189행 |
| CamView 90° 회전 | **있다** | `main.css` `.cambody img` — `transform: rotate(90deg)` + `width:177.7778%`. 폰이 90° 돌아 장착돼 표시만 세운 것 (2026-08-06) |
| MJPEG 실제 해상도 | **1920×1080** | 08-06 실측. `intrinsics`는 2560×1440 — 투영 전 스케일이 필요하다 |
| proposal 선행 조건 | **툴 좌표계 캘리브레이션** | `VISION-CONTRACT.md` ⛔절, `GAP-MATRIX.md` 82행. 그 전엔 전부 `toolCalibrationUnverified` 로 거부된다 |

---

## 2. 목표

1. **카메라 상태 HUD**: LIVE/끊김, 해상도, 프레임 나이, 정합 상태.
2. **읽기 전용 공간 HUD**: 작업대, 벽, 금지영역, 현재 TCP(툴 중심점).
3. **proposal 검토 스트립**: 측정 당시 사진, 현재 영상, 목표 차이, 만료시간, 승인/거부.
4. **객체 탐지 HUD**: 사람, AMR, 장애물, 탄두/타겟 박스 + 클래스 + 신뢰도.

---

## 3. 설계 원칙

- **안전은 HUD가 아니라 게이트가 한다**. 글로벌 카메라는 시각화·보조 인식만. 로봇 멈춤은 기존 `workspace` 소프트리밋 + 충돌 감지가 담당.
- **승인/거부 버튼은 영상 위에 두지 않는다**. 오른쪽 패널(LivePanel 또는 별도 proposal 패널)에 둔다. 오조작 위험과 시점 혼동을 막는다.
- **중복 정보는 금물**. 상단 SafetyBar에 phase/조종권/서보/충돌/STOP이 이미 있으므로 카메라 HUD에 반복하지 않는다.
- **좌표 기반 HUD는 `labToCam`이 선행**. 없으면 공간 오버레이를 그릴 수 없다.
- **proposal은 "눈"이 아니라 "검토창"부터**. 손목 D435가 깊이/파지 후보를 만들고, 글로벌 카메라가 전체 작업공간에서 상식적인지 사람이 확인하게 한다.

---

## 4. 단계별 HUD

### 4.0 카메라 상태 HUD (먼저)

`CamView` 머리글 아래, 영상 위쪽에 얇은 띠로 표시.

| 요소 | 표시 | 조건 |
|---|---|---|
| LIVE / 끊김 / 여는 중 | 텍스트 | `live` 상태 |
| 해상도 | `1920×1080` 등 | 이미지 `naturalWidth/Height` 읽기 |
| **캘리브레이션 불일치** | `보정값 2560×1440 ≠ 스트림 1920×1080` | 위 해상도가 `intrinsics.widthPx/heightPx` 와 다르면 **경고색.** 조용히 스케일만 하고 넘어가면 어긋난 걸 아무도 모른다 |
| 프레임 나이 | `80ms 전` | ❌ **`onLoad` 로 재지 않는다** — Chrome 은 첫 프레임 1회만 쏜다(08-06 실측, §9). `/status.json` 저주기 폴링으로 잰다 |
| 정합 상태 | `정합 미검증` / `RMS 0.80px` | 최상위 `labToCam` 유무 / `labToCam.rmsPx` (§6.2 — `extrinsics.rmsPx` 라는 경로는 없다) |

### 4.1 공간 HUD (`labToCam` 필요)

⚠ **구현 경로는 §7.1 의 §G2 승격이다.** 아래 표는 *무엇을 그리나*의 명세이고,
*어떻게 그리나*는 `ar-global-camera.md` §G2(three.js `PerspectiveCamera` + `layout-view.root`)를
따른다. 아래의 "SVG/Canvas 로 직접 투영" 은 그 경로를 모르고 쓴 것이라 채택하지 않는다.
어느 쪽이든 **CSS 90° 회전과 1920/2560 스케일을 먼저 정리해야 한다** (§7 단계 0 · §9).

| 요소 | 표시 | 색상/스타일 |
|---|---|---|
| 작업대 경계 | 사각형 | `--c-selected`, 1px 실선 |
| 벽/금지영역 | 사각형/반투명 | `--c-warn`, 10% 채움 |
| 현재 TCP | 십자가 + 라벨 | `--c-info` |
| proposal 목표 | 원/화살표 | `--c-ok` 또는 `--c-warn` |

좌표 변환 체인:

```text
lab 좌표(mm)  →  cam 좌표(mm)  →  픽셀(px)
        labToCam          intrinsics.project
```

### 4.2 proposal 검토 스트립

LivePanel 아래 또는 별도 proposal 패널에 배치.

```text
[측정 당시 사진]  [현재 실영상]
ΔTCP  +12 / -4 / -18mm
판정  needsHumanConfirm
만료  12초 남음
[ ] 이 목표로 이동한다
[거부] [승인]
```

- **측정 당시 사진**: proposal이 `frameId` 또는 `snapshot`을 참조해야 표시 가능.
- **승인 체크박스**: 위험한 동작은 체크박스 + 실행 버튼 형태로 통일.
- **버튼 위치**: 오른쪽 패널. 영상 위 버튼 금지.

### 4.3 객체 탐지 / 와우포인트 HUD

| 대상 | 글로벌 카메라 역할 | D435 뎁스 역할 |
|---|---|---|
| 사람/AMR | 전체 작업공간 위치, 방향 | 상세 거리/높이 |
| 큰 장애물 | 경고 박스, 충돌 가능성 힌트 | 정밀 거리 측정 |
| 탄두/타겟 | 클래스, 2D 위치, 방향(축) | 6D 자세(높이·기울기) |

와우포인트용 탄두 감지:
- 색상/형태/마커 기반 2D 디텍션으로 충분.
- 방향 추정 시 화살표 오버레이.
- 6D 정밀 자세가 필요하면 D435로 핸드오프.

---

## 5. 화면 명세

### 5.1 CamView 확장

파일: `FR5/src/features/live/CamView.jsx`

- 기존 `<img>`는 그대로 둔다.
- 영상 위에 `position:absolute`인 오버레이 컨테이너 추가.
- 오버레이는 `pointer-events:none` 기본, 버튼/상호작용 요소만 `auto`.
- 해상도는 `img.naturalWidth/Height`로 동기화.

```jsx
<div className="camoverlay">
  <CamStatusBar />
  <SpaceOverlay labToCam={...} intrinsics={...} />
  <DetectionOverlay detections={...} />
</div>
```

### 5.2 proposal 패널

파일: 신규 `FR5/src/features/live/ProposalPanel.jsx`

- `LivePanel` 옆 탭 또는 하단 스트립으로 배치.
- `GET /proposals` 폴링.
- 각 proposal 카드: 측정 사진, 현재 영상, ΔTCP, verdict, 만료 카운트다운, 승인/거부.

---

## 6. 계약 변경 필요 사항

### 6.1 `VISION-CONTRACT.md`

proposal 스키마에 아래 필드 추가:

```jsonc
{
  "cameraId": "wrist-d435",           // 또는 "global-galaxy-s24"
  "frameId": "f-7f3a-001",            // 측정 당시 프레임 참조
  "snapshotUrl": "/api/camera/frames/f-7f3a-001",  // 사람이 볼 사진
  "calibId": "global-cam-2026-08-06", // 사용한 캘리브레이션 ID
  "bboxPx": [x, y, w, h],             // 측정 당시 픽셀 박스 (선택)
  // 기존 필드 유지
}
```

GET /proposals 응답에 동일 필드 포함.

### 6.2 `Shared/data/config/global-cam.json` — **계약을 새로 만들지 않는다**

이 파일의 주인은 `scripts/map/extrinsics.py` 다 (`_생성됨: 직접 고치지 마라`).
스키마를 여기서 발명하면 **생산자(`extrinsics.py`)·게이트(`check-calib.sh`)·소비자(HUD)
셋이 갈린다.** 아래가 `extrinsics.py:159` 가 실제로 쓰는 모양이며, HUD 는 이걸 읽는다.

```jsonc
{
  "intrinsics": { ... },
  "labToCam": {                  // ★ 최상위다. extrinsics 로 감싸지 않는다
    "rvec": [rx, ry, rz],        // 로드리게스 회전 벡터 (cv2.solvePnP 원형 그대로)
    "tvecMm": [tx, ty, tz],
    "camPosMm": [x, y, z],       // 실험실 좌표에서 카메라가 선 자리
    "heightMm": 1820.0, "depressionDeg": 22.5,
    "rmsPx": 0.803, "tags": 4, "shot": "tags-01.jpg"
  },
  "verified": true
}
```

⚠ **`extrinsics.labToCam` 으로 감싸면 게이트가 초록불로 거짓말한다.**
`check-calib.sh` 는 최상위 `labToCam` 만 본다 — 없으면 "아직 없음 (지금은 통과)" 를 찍는다.
정합이 없는데 통과하는 상태가 되고, HUD 는 빈 값으로 좌표를 그린다.
**결측을 정상으로 읽는 그 모양**이라 이 문서에서 제일 비싼 오류다.

### 6.3 `LAYOUT-METRICS-CONTRACT.md` (선택)

`/api/camera/*` 관문이 손목 D435 외에 글로벌 카메라도 다루게 되면 `cameraId`로 구분.  
혹은 글로벌 카메라는 별도 경로(`/api/global-cam/*`)로 두고, proposal의 `cameraId`만으로 참조.

---

## 7. 구현 순서

**0 이 새로 앞에 붙었다.** 오버레이를 얹는 순간 회전·해상도가 좌표를 깨므로, 그림보다
좌표 규약이 먼저다. proposal(4~6)은 **툴 좌표계 캘리브레이션 뒤**라 이번 사이클이 아니다.

| 단계 | 작업 | 완료 판정 |
|---|---|---|
| **0a** | ~~해상도 정합~~ **✅ 닫힘 (08-06)** — 순수 축소로 확정. `fx·fy·cx·cy × (스트림폭/보정폭)`, `dist` 불변 | 스케일 함수 1개 + 단위 검사. 재측정 없음 |
| **0b** | **회전 정합 — 남은 하나.** CSS 90° 를 유지하고 오버레이를 같은 변환 아래 둘지, 폰 장착/설정으로 옮겨 CSS 에서 없앨지 정한다. **변환은 한 함수에만 산다** (하드 룰 5) | 결정 1줄 + 모서리 4점이 실제 위치와 겹친다 |
| 1 | `CamView` 상태 HUD | 실렌더: LIVE/끊김/해상도/캘리브 불일치/프레임 나이. **프레임 나이는 `/status.json` 폴링**(`onLoad` 는 1회뿐 — §9). `<img crossOrigin="anonymous">` 도 여기서 같이 넣는다 |
| ~~1.5~~ | ~~내부 파라미터 재측정~~ **✅ 닫힘 (08-07)** | `fx 1728.17 · HFOV 73.05° · RMS 0.469px · 앞뒤차 0.7% · 25장`. 기울기 40~60° 가 관건이었다 (`evidence/2026-08-07/`) |
| ~~2~~ | ~~`labToCam` 실측~~ **✅ 닫힘 (08-07)** | 상판에서 0.75m · 하향 26.0° · 태그 4장 · **RMS 0.82px**. 눈으로도 확인 — 상판 격자·수직 기둥이 실물에 붙는다. 원점은 상판 태그 id0 |
| 3 | 읽기 전용 공간 HUD: 작업대·벽·TCP | `ar-global-camera.md` §G2 를 승격한다 (아래 §7.1). 화면 중앙부에서 실물 모서리와 가상 벽이 겹친다 |
| ~~—~~ | ~~*(관문) CORS spike*~~ | ✅ **2026-08-06 통과** — `ACAO: *` 확인, `crossOrigin="anonymous"` 로 `/video` 픽셀 읽기 성공 (§9) |
| 4 | `VISION-CONTRACT.md` 에 `cameraId`/`frameId`/`snapshot`/`calibId` 추가 | 문서 갱신 |
| 5 | `GET /proposals` 목업/브리지 구현 | `FR5/bridge/main.py` 라우트 + 목업 1건 |
| 6 | proposal 검토 스트립 UI | 승인/거부 동작, 만료 처리. **툴 캘리브레이션 전에는 실경로가 전부 거부되므로 "됐다"고 적지 않는다** |
| 7 | 객체 탐지 모듈 연동 | 사람/AMR/탄두 박스 오버레이 |
| 8 | 탄두 와우포인트 HUD | 시연 시 심사위원 화면 확인 |

### 7.1 공간 HUD 는 새로 설계하지 않는다 — §G2 승격이다

`docs/research/ar-global-camera.md` §G2 가 **같은 문제를 이미 설계해 뒀다**:
`solvePnP` → three.js `PerspectiveCamera` 를 그 포즈에 놓고 `layout-view.root` 를 영상 위에
렌더. `extrinsics.py` 가 바로 그 산출물(`rvec`·`tvecMm`)을 낸다.
§4.1 의 "SVG 로 직접 투영" 은 그 경로를 모르고 두 번째로 설계한 것이다 — 쓰지 않는다.

---

## 8. 검증 기준

- **단위**: `CamView` 오버레이 좌표가 `global-cam.json` 투영과 일치.
  - 회전·해상도 변환 함수(§7 단계 0)를 **직접** 검사한다. 알려진 픽셀 하나가
    1920 프레임 · CSS 90° 회전 뒤 어디로 가는지 손계산 값과 맞춘다.
- **실렌더**: 
  - 카메라 상태 HUD가 끊김/지연 시 정확히 표시.
  - 공간 HUD가 합성 고정물에서 태그 중심과 **화면 중앙부 1px 이내**.
    가장자리는 왜곡 미보정이라 별도 허용치를 둔다 (§9).
  - proposal 스트립에서 승인 시 `moveJ`/`gripper` 번역, 거부 시 아무 일도 안 일어남.
- **실기**:
  - `labToCam` 실측 후 실영상 위 TCP 위치가 실제 손끝과 일치.
  - 탄두 감지 박스가 실물과 5cm 이내.

---

## 9. 위험/제약

- **깊이 없음**: 글로벌 카메라는 RGB 단일. 3D 충돌 판정은 불가. 시각화/경고로만 사용.
- **❌ CSS 90° 회전이 오버레이 좌표를 깬다 — 실측 확정 (2026-08-06 · 배포본)**:
  `.cambody img` 는 `matrix(0, 1, -1, 0, …)` 로 돌아 있다. 형제로 얹은 오버레이가 칸을 그냥
  채운다고 가정하면(§5.1 그대로) 이만큼 어긋난다 — `.cambody 338×574` 기준:

  | 이미지 점 | 실제로 찍히는 자리 | 순진한 오버레이 | 어긋남 |
  |---|---|---|---|
  | 좌상 | (338, −13) | (0, 0) | **338 px** |
  | 우상 | (338, 587) | (338, 0) | **587 px** |
  | 중앙 | (169, 287) | (169, 287) | 1 px |
  | 좌하 | (0, −13) | (0, 573) | **586 px** |
  | 우하 | (0, 587) | (338, 573) | **338 px** |

  **중앙만 맞고 나머지는 전부 틀린다** — 가장 나쁜 실패 모양이다. 개발 중 화면 가운데를 보며
  "대충 맞네" 로 통과시키기 때문이다. 오버레이를 같은 변환을 받는 래퍼 안에 넣거나,
  회전을 폰 장착/설정으로 옮겨 CSS 에서 없앤다. 후자가 §10(픽셀 읽기)까지 같이 푼다.
- **✅ 해상도 불일치 — 스케일 하나로 정확히 닫힌다 (2026-08-06 실측)**: 1920×1080 은
  2560×1440 의 **순수 축소**다. 같은 장면을 두 해상도로 찍어 ORB 대응점 395/400 으로 푼 결과
  **배율 0.7502 · 회전 0.01° · 이동 0.2px** (크롭 가설이면 1.0000 이 나와야 한다).
  메타데이터도 `crop_x=50 crop_y=50 focal_length=5.4 zoom=100` 로 동일하다.
  → **1080p 용으로 따로 재지 않는다.** 2560×1440 에서 잰 내부 파라미터를 그대로 두고
  `fx·fy·cx·cy × (스트림폭/보정폭)` 만 한 함수에 둔다. **`dist` 는 정규화 좌표라 안 바뀐다.**
  1080p 로 다시 재면 코너 검출이 28/35 로 떨어진다 (`cam-lock.sh` 실측 주석).
- **❌ 왜곡을 핀홀로는 다 못 그린다 — 재측정본으로 확정 (2026-08-07)**: `dist` 를 실제로 적용해
  핀홀 투영과의 차이를 `2560×1440` 격자에서 쟀다.

  | 위치 | 어긋남 |
  |---|---|
  | 정중앙 | 0.0 px |
  | 가로 1/4 지점 | 6.8 px |
  | 좌변 중앙 | 42.3 px |
  | 좌상 모서리 | **74.8 px** |
  | 화면 최대 | **82 px** |

  **어긋남 ≤1px 는 반경 344px 안뿐이다** — 화면 대각 반경 1469px 의 **23%**.
  허용치를 늘리면 ≤2px 442px · ≤5px 612px · ≤10px 810px.
  → three.js `PerspectiveCamera` 만으로 화면 전체를 덮으면 **모서리에서 82px** 어긋난다.
  폰 화면 폭 338px 로 축소하면 약 11px. **못 쓸 정도는 아니지만 안전구역 표시엔 크다** —
  영상을 먼저 왜곡 보정해 핀홀로 만든 뒤 겹치는 쪽이 맞다.

  > 2026-08-06 판 이 자리에는 `좌변 680px · 모서리 2064px` 이 적혀 있었다. 그 계산은
  > 당시 저장돼 있던 `dist`(`k3 = 16.62`, 물리적으로 불가능한 값)를 참으로 가정한 것이라
  > 무효였다. **판정 방향은 같고 크기만 25배 작다.**

  ⚠ **기존 게이트가 초록불인 것을 근거로 삼지 마라.** `check-overlay.sh:29`·`check-camera.sh:32`
  는 `D = np.zeros(5)` 로 투영한다 — 어긋나게 만드는 항을 **0 으로 두고** 잰 결과가
  `최대 오차 0.000px` 이다. 그 게이트가 증명한 것은 "OpenCV 와 three.js 의 핀홀 수식이 같다"
  이지 "실제 렌즈 화면 위에 겹쳐도 맞는다" 가 아니다. 단계 3 의 완료 판정에
  **실사진 기반 검사**를 하나 더 둔다.
- **✅ 브라우저 픽셀 읽기 — 관문 통과 (2026-08-06 실측)**: IP Webcam 0.4 가 `/shot.jpg`·`/video`
  둘 다에 **`Access-Control-Allow-Origin: *`** 를 준다. 실기 측정:
  `crossOrigin` 없으면 `SecurityError: The canvas has been tainted by cross-origin data`,
  **`crossOrigin="anonymous"` 면 `/video` 스트림까지 `getImageData` 성공**(1920×1080).
  → §10 브라우저 내 inference 는 성립한다. 단 **`<img crossOrigin="anonymous">` 는 필수다** —
  지금 `CamView.jsx` 의 `<img>` 에는 없으므로 추론을 붙일 때 같이 넣는다.
- **❌ 프레임 나이를 `onLoad` 로 재면 틀린다 — 확정 (2026-08-06 실측)**: Chrome 은
  `multipart/x-mixed-replace` `<img>` 에 **`load` 를 첫 프레임 한 번만** 쏜다
  (10초 관측: 201ms 에 1회, 그 뒤 0회. 그동안 영상은 계속 갱신됐다).
  §4.0 의 "`onLoad` 시각 − 현재 시각" 은 **살아 있는 스트림을 무한히 늙게 만든다.**
  → 프레임 나이는 `/status.json` 저주기 폴링으로 잰다. 다만 이 성질 덕에 지금 `CamView` 의
  **첫 프레임 판정(`live`)은 정상 동작한다** — 고칠 것은 나이 표시뿐이다.
- **Dashboard 미연결**: proposal 검토창은 `FR5/src/`에 둔다. Dashboard에서 보여주려면 브리지 연결 경계를 먼저 만들어야 함.
- **카메라 호스트 미정**: 객체 탐지 inference 위치(폰 NPU / 브리지 PC / 우분투)를 먼저 정해야 함.

---

## 10. 기술 스택 조사 (미확정 — 2026-08-06)

> ⚠️ 이 섹션은 **웹 조사 결과**이며, 아직 확정은 아니다. 실제 도입 전에 spike(간단한 실험)로 검증해야 한다.

### 10.1 객체 탐지

| 후보 | 추천도 | 근거 |
|---|---|---|
| **YOLOv8n/v11n → ONNX → ONNX Runtime Web** | ⭐ 1순위 | 가벼움(약 3MB), 실시간, Ultralytics `model.export(format="onnx")` 지원, 브라우저에서 MJPEG 직접 처리 가능 |
| Transformers.js `object-detection` | 대안 | NPM 하나로 실행, 모델 자동 다운로드. 다만 모델 선택 폭이 작고 작은 모델은 정확도가 낮음 |
| MediaPipe Object Detector | 대안 | Google 경량 모델, 폰 NPU에서 빠름. 커스텀 클래스 학습이 어려움 |
| YOLOv8 TFLite (폰 NPU) | 대안 | Galaxy S24+ NPU/GPU delegate로 매우 빠름. 단 Android native 코드 또는 웹-네이티브 브리지가 필요 |
| OpenCV.js Haar Cascade | 비추천 | 브라우저에서만 동작하지만 딥러닝보다 정확도가 크게 떨어짐 |

탄두/와우포인트용:
- 처음에는 COCO 클래스("bottle", "cup" 등)로 대체 가능.
- 탄두 실물 도착 후 50~100장으로 파인튜닝.
- 방향(축)이 필요하면 **YOLO OBB**(Oriented Bounding Box) 모델 고려.

### 10.2 깊이 추정 (선택)

| 후보 | 추천도 | 근거 |
|---|---|---|
| **Depth Anything V2 small → ONNX → ONNX Runtime Web** | ⭐ 1순위 | 단일 RGB로 상대 깊이 추정, ONNX/Transformers.js 지원 |
| Transformers.js `depth-estimation` | 대안 | 같은 모델을 더 쉬운 API로 실행 |

주의:
- **상대 깊이**는 실제 mm를 보장하지 않는다. HUD에서는 "멀리/가까움" 색상 힌트로만 사용.
- **메트릭 깊이**는 실내 도메인(KITTI/NYU)에서 학습돼 실험실에서 왜곡이 클 수 있다.
- 정확한 Z는 D435에 맡긴다.

### 10.3 좌표 투영

| 후보 | 추천도 | 근거 |
|---|---|---|
| **Three.js `PerspectiveCamera` + `Vector3.project()`** | ⭐ 1순위 | 프로젝트에 이미 `Shared/view3d/`로 바닐라 three.js가 있음 |
| OpenCV.js `projectPoints` | 대안 | 카메라 투영 공식 그대로 구현 가능. 단 추가 WASM 로드 |
| 자체 행렬 연산 | 대안 | 의존성 없음. 다만 테스트 비용 큼 |

### 10.4 인프라/호스트 선택

| 호스트 | 장점 | 단점 |
|---|---|---|
| **브라우저 (ONNX Runtime Web)** | 스트림 서버 전송 불필요, 지연 0, 구조 단순 | 모델 크기/디바이스 성능 의존 |
| 폰 NPU (TFLite/CoreML) | 매우 빠름 | 웹-네이티브 통신 추가 필요 |
| 브리지 PC/서버 (Python + OpenCV) | 무거운 모델 가능 | MJPEG 재전송 지연, 대역폭 추가 |
| 라즈베리파이 (PoE) | 카메라 옆에 붙어 있음 | 성능 낮음, 경량 모델만 |

**1순위는 브라우저 내 inference**다. 글로벌 카메라가 이미 브라우저가 폰 `/video`를 직접 보고 있으므로, ONNX Runtime Web을 붙이면 서버로 스트림을 옮길 필요가 없다.

### 10.5 D435 뎁스와의 관계

**중복되지 않는다. 분업이다.**

| 기능 | 글로벌 카메라 | D435 뎁스 |
|---|---|---|
| 작업대 전체 상황 | ✅ 주 | ❌ 시야 부족 |
| 사람/AMR/큰 장애물 위치 | ✅ 주 | ⚠️ 제한적 |
| 탄두 와우포인트 감지 | ✅ 주 | ❌ 시야 부족 |
| 정확한 mm 거리 | ⚠️ 추정 | ✅ 주 |
| 파지 자세/높이 | ❌ 불가 | ✅ 주 |
| Min-Z 사각지대 판정 | ❌ 불가 | ✅ 주 |
| 접근 중 충돌 회피 | ⚠️ 힌트 | ✅ 주 |

### 10.6 추가 의존성 후보

| 패키지 | 용도 | 비고 |
|---|---|---|
| `onnxruntime-web` | 브라우저 ONNX 추론 | Vite/ESM import |
| `ultralytics` (Python) | YOLO 모델 학습/ONNX export | 개발 의존성 |
| `@huggingface/transformers` | 대안/빠른 실험 | object-detection, depth-estimation |
| `three` | 좌표 투영 | 이미 프로젝트에 존재 |

---

## 11. 추가 조사 결과 (2026-08-06)

> ⚠️ 이 섹션도 **조사 중**이며 확정은 아니다.

### 11.1 IP Webcam 설정 — `scripts/map/cam-lock.sh`

- **기본 해상도**: 2560×1440 (`--size 1920x1080` 옵션 가능)
- **화질**: 90 (더 낮은 `q35`가 태그 검출을 깎았음)
- **화이트밸런스**: 형광등(`fluorescent`)
- **초점**: **수동 초점을 쓰지 않는다** — `focusmode=auto` + `/focus` 1회로 자동초점이 맞춘 상태를 그대로 둔다. `focusmode=off`는 거짓말이었음 (`global-cam-phone.md` 23-42행).
- **줌**: `zoom=100` 검사. 1.0배가 아니면 지난 캘리브레이션 무효.
- **선명도 판정**: `focus_distance` 숫자가 아니라 라플라시안 분산 수렴으로 본다.

**HUD 영향**: `CamView`에서 실제 MJPEG 해상도와 `global-cam.json`의 `intrinsics.widthPx/heightPx`가 다르면 투영이 어긋난다. HUD 투영 전에 `cam-lock.sh`를 다시 돌려 현재 설정을 확인해야 한다.

### 11.2 `/proposals` 브리지 설계 가능 위치

- `FR5/bridge/main.py` 41-54행: `app = FastAPI()`, `session`, `cmds`, `teach`, `slots`, `recordTask` 인스턴스가 있다.
- 라우트 패턴은 `API-CONTRACT.md`를 따라 `main.py`에 직접 두고, 상태 저장은 별도 클래스/모듈에 둔다.
- **참고 모듈**:
  - `teach.py` / `TeachService`: 캡처, 녹화, 파일 저장
  - `slots.py` / `SlotStore`: 슬롯 저장, 승인, draft/approved 상태
  - `owner.py` / `Owner`: 조종권 토큰 관리
- **proposal 저장 후보**: `DATA_DIR` (`~/fr5-data/proposals/`)에 JSON 파일, 또는 메모리 + history. `teach`처럼 파일 저장이 자연스럽다.
- **승인/거부**: `owner_gate(body)`로 조종권 확인 후 `session`/`cmds`의 `moveJ`/`gripper` 번역 경로로 연결. `approve`가 직접 로봇을 움직이지 않고, **허용목록 명령으로 번역**해야 한다 (`VISION-CONTRACT.md` 14-20행, `API-CONTRACT.md` 396-399행).
- **만료 검사**: `validUntil`은 접수 시점과 번역 직전 두 번 검사 (`VISION-CONTRACT.md` 76-78행).

### 11.3 탄두 실물 상태

- `GAP-MATRIX.md` 116행: "미사일 장난감의 결합 방식 미정 — 배송 중 (2026-08-05)"
- **현재로서는 탄두 실물이 없다**. 와우포인트용 객체 탐지 모델은 실물 도착 후에 파인튜닝 또는 클래스 매핑을 정할 수 있다.
- 처음에는 COCO 클래스("bottle", "cup")로 대체하거나, 색상/마커 기반의 단순 탐지로 먼저 UI를 검증한다.

---

## 12. 다음 행동

고급 모델이 할 일 — **§7 순서 그대로다. 1~3 이 이번 사이클이고 나머지는 그다음이다.**

1. **회전·해상도 규약을 정한다.** CSS 90° 를 없앨지 오버레이를 같이 돌릴지, 1920↔2560 스케일을
   어디 한 함수에 둘지. 그림보다 이게 먼저다 (§9 첫 두 항목).
2. `CamView.jsx` 에 상태 HUD 를 붙인다. **프레임 나이는 `onLoad` 가 프레임마다 오는지 먼저 본다.**
3. `scripts/map/extrinsics.py` 를 돌려 `labToCam` 을 낸다 (RMS ≤ 2.0px).
   **스키마는 만들지 않는다** — `extrinsics.py` 가 쓰는 최상위 `labToCam` 을 그대로 읽는다 (§6.2).
4. 공간 HUD 는 `ar-global-camera.md` §G2 를 승격한다 (§7.1). 새로 투영기를 짜지 않는다.
5. *(관문)* CORS spike — 이게 통과해야 아래 6~8 이 성립한다 (§9).
6. `VISION-CONTRACT.md` 에 proposal 측정 증거 필드 추가 → `/proposals` 목업 → 검토 스트립.
   **툴 좌표계 캘리브레이션 전에는 실경로가 전부 거부된다** (`GAP-MATRIX.md` 82행).
7. (선택) YOLOv8n ONNX + ONNX Runtime Web spike.
8. (선택) Depth Anything V2 ONNX + 브라우저 깊이 추정 spike.

