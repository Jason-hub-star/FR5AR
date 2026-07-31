# 다음 세션 — 구조 개편 선택지

분류: **조사**. 착수 전 판단 기록이고 SSOT가 아니다.
작성 2026-07-30 (AR 슬라이스가 폰에서 동작하는 것을 확인한 직후)

> **결론이 났다 (2026-07-30 같은 날 오후).** 선택지 **B(Vite + 바닐라)** 로 정하고
> `DECISION-LOG` **D17** 에 올렸다. Vite 관문도 실제로 재서 통과했다
> (`docs/evidence/2026-07-30/vite-gate.md`).
>
> **이 문서를 근거로 코드를 짜지 마라.** 확정본은 아래로 갔다 —
> 번들 경계·폴더·게이트 경로·이관 순서는 **`docs/ref/BUILD-VITE.md`**,
> 관제화면은 **`docs/ref/CONSOLE-REACT.md`**, 공용 모델은 **`docs/ref/SHARED-CORE.md`**.
>
> 이 문서는 **왜 그렇게 정했는지의 판단 과정**으로만 남긴다. 그 뒤 목표가 확정되면서
> (D16) `features/` 가 4개 → 6개로 늘고 마일스톤 순서가 뒤집힌 것은 여기 반영돼 있지 않다.

## 무엇을 정해야 하나

주인님이 마감 시점에 낸 요구 넷.

1. HTML 유지보수가 어렵다 → **프레임워크로 바꿀까**
2. **기능별 폴더**로 구현하고 싶다
3. 팀원이 깃허브에서 쉽게 읽게 **변수명을 쉽게**
4. **마커 이름을 읽기 좋게** + 쉽게 교체

---

## 1. 프레임워크 — **Vite + 바닐라를 권한다**

### 지금 아픈 곳은 "HTML" 이 아니다

`web/ar.html` 이 **550줄**이고 CSS·JS가 한 파일에 들어 있다. 그게 아픈 곳이다.
그런데 더 비싼 문제가 하나 더 있다 — **importmap을 손으로 관리한다.**

```html
"three/examples/jsm/loaders/STLLoader.js": "./js/vendor/STLLoader.js",
```

지정자를 하나 빠뜨리면 **모듈 해석에서 통째로 멈춘다.** 실제로 겪었다
(`evidence/2026-07-30/gripper-mount.md` §함정). 번들러는 이 부류의 버그를 아예 없앤다.

### 선택지

| | 얻는 것 | 잃는 것 | 판정 |
|---|---|---|---|
| **A. 바닐라 유지 + 파일 쪼개기** | 의존성 0. 배포가 지금처럼 단순 | importmap 손관리 계속. 번들 최적화 없음 | 가장 싸지만 근본 문제가 남는다 |
| **B. Vite + 바닐라** | **importmap 소멸** · HMR · 트리셰이킹 · 요청 25개 → 몇 개 | 빌드 단계 추가. Vercel 설정 변경 | **← 권함** |
| C. Vite + React + R3F | 대시보드 화면 14개·버튼 192개에 유리 | AR 화면에는 이득이 거의 없다. 학습·번들 비용 | **V1(대시보드) 시작할 때** |
| D. Next.js | — | SSR이 3D/AR에 주는 이득이 없다. 복잡도만 | 안 한다 |

### 왜 B 인가

- `STACK.md`가 이미 **"React는 화면이 복잡해진 뒤에"** 라고 적어뒀다. AR 화면 하나는 그 시점이 아니다
- **첫 로딩 7.5MB 중 STL이 6.4MB**고 압축이 안 된다 (D12). 번들러는 JS 쪽(1MB)만 줄인다 —
  즉 **용량 문제의 주범은 번들러로 안 풀린다.** 그건 그리퍼 몸통 데시메이션이 답이다.
  번들러를 쓰는 이유는 용량이 아니라 **importmap 제거와 파일 분리**다
- 나중에 React를 얹을 때 Vite 위에서 점진적으로 된다 (D는 되돌리기 어렵다)

### 확인해야 할 위험 하나

`ar-threex.mjs`(1.6MB)는 **표준 npm 패키지가 아니다** — `main`이 A-Frame 빌드이고
`module`·`exports` 필드가 없다 (`STACK.md`). Vite에서 파일 경로로 직접 import 하면 되지만
**착수 전에 그것만 먼저 확인한다.** 안 되면 A로 되돌린다.

---

## 2. 기능별 폴더 — 제안

```
src/
  features/
    ar/          ar 화면 · 마커 정합 · 스무딩 · 진단
    robot/       URDF 로딩 · 그리퍼 부착 · 관절
    trajectory/  FK 보간 · 궤적 · 재생
    safety/      안전 범위 표시
  Shared/
    config/      .env 에서 생성된 설정 읽기
    units/       mm·도 ↔ m·라디안 변환 (하드 룰 5 — 한 곳만)
  vendor/        three.js · ar.js · urdf-loader
web/
  assets/        URDF · 메시 · 마커
```

**`Shared/units/` 를 반드시 만든다.** 지금 변환이 `robot-view.js` 안에 흩어져 있고,
하드 룰 5가 "변환은 한 곳에서만"인데 그 한 곳이 명시적 모듈이 아니다.

---

## 3. 변수명 — 지금 헷갈리는 것들

| 지금 | 문제 | 제안 |
|---|---|---|
| `markerRoot` / `markerRaw` | 둘 다 "마커"인데 뭐가 보이는 쪽인지 모른다 | `visibleMarker` / `trackedMarker` |
| `scaleRoot` | 무엇을 스케일하는지 안 보인다 | `markerUnitsToMeters` |
| `stage` | 의미가 없다 | `zUpToYUp` |
| `mcfg` / `gcfg` | 줄임말 | `markerConfig` / `gripperConfig` |
| `applyMount` | 무엇을 어디에 | `applyGripperMount` |
| `diag` | | `detectStats` |

**규칙 하나만 정한다: 좌표계를 다루는 이름에는 "무엇에서 무엇으로"를 넣는다.**
`markerUnitsToMeters`, `zUpToYUp` 처럼. 이 프로젝트에서 좌표계·단위가 가장 자주 틀린 곳이다.

---

## 4. 마커 이름 — 지금은 번호가 곧 정체다

```
web/assets/marker/barcode/2.png              ← 이게 무슨 마커인지 파일명만 보고 모른다
web/assets/marker/marker-print-A4-170mm-bc2.png
```

**번호(`barcodeValue`)는 지울 수 없다** — 코드 설정과 인쇄물이 그 번호로 맞춰지고,
다르면 화면에 아무것도 안 뜬다. 그래서 "번호를 없애고 이름만"은 안 된다.
**번호 + 역할**을 같이 넣는다.

| 지금 | 제안 |
|---|---|
| `barcode/2.png` | `barcode/hamming63-id2.png` |
| `marker-print-A4-170mm-bc2.png` | `marker-A4-170mm-id2.png` |

그리고 `.env`에 **사람이 읽는 이름**을 더한다 — 화면과 인쇄 시트에 같이 찍는다.

```
FR5_MARKER_BARCODE=2
FR5_MARKER_LABEL=예비            # 화면·시트에 표시. 교체할 때 헷갈리지 않게
```

### 교체를 쉽게 — 이미 절반은 돼 있다

- `.env` 한 줄(`FR5_MARKER_BARCODE`) → 생성기가 JSON 을 다시 굽는다
- 생성기가 **원본이 없는 번호를 거부**한다 (`AVAILABLE_BARCODES = [2,3,5]`)
- URL 로 그 폰만 임시 교체 (`?bc=5`)
- ⚙ 로 크기 조절

**남은 것**: 인쇄 시트 파일명과 `.env` 를 한 번에 바꾸는 절차가 없다.
`scripts/build/config.mjs` 에 `--marker <번호>` 를 붙여 시트 생성까지 이어지게 한다.

---

## 착수 순서 (다음 세션)

1. **`ar-threex.mjs` 가 Vite 에서 import 되는지만 먼저 확인** — 안 되면 A로 되돌린다
2. Vite 도입. **화면 하나(`robot.html`)만 먼저 옮겨 본다.** 되면 나머지
3. 기능별 폴더로 이동 + `Shared/units/` 신설
4. 변수명 일괄 정리 (좌표계 이름 규칙 적용)
5. 마커 파일명 · `FR5_MARKER_LABEL` 추가
6. Vercel 빌드 설정 변경 → **배포는 주인님 지시를 받고** 한다

**게이트를 먼저 고친다.** `scripts/check/*` 가 지금 파일 경로를 알고 있어서,
폴더를 옮기면 게이트가 먼저 깨진다. 옮기기 전에 게이트를 새 경로로 맞춘다.

## 하지 않을 것

- Next.js 도입 — SSR이 주는 이득이 없다
- 마커 번호를 파일명에서 빼기 — 번호가 정체다
- 용량 문제를 번들러로 풀려 하기 — STL 6.4MB 는 압축도 번들도 안 듣는다.
  데시메이션이 답이고 그건 별 과제다
