# 2026-07-30 — Vite 관문 측정

분류: **증거**. `docs/ref/rnd/NEXT-REFACTOR-2026-07-30.md`가 착수 전 첫 관문으로 지목한
**"`ar-threex.mjs`가 Vite에서 import 되는가"**를 실제로 빌드해 확인한 기록.

판정: **통과.** 그리고 원래 몰랐던 소득 두 개와 죽은 파일 하나를 같이 찾았다.

## 무엇을 왜 재나

번들러로 바꾸려는 이유는 용량이 아니라 **importmap 손관리 제거**다.
지정자를 하나 빠뜨리면 모듈 해석이 통째로 멈추는데 실제로 겪었다
(`2026-07-30-gripper-mount.md` §함정).

그런데 `ar-threex.mjs`(1.6MB)는 표준 npm 패키지가 아니다 — npm 레지스트리의 `main`이
A-Frame 빌드이고 `module`·`exports` 필드가 없다. 저장소의 `.mjs` 빌드를 파일로 받아 쓰고 있다.
**이게 Vite에서 안 되면 이관 계획 전체가 무효**라 먼저 쟀다.

## 1. 모듈 형태 — 정상 ESM 이다

파일 앞뒤를 직접 열어 확인했다.

| 항목 | 실측 |
|---|---|
| 첫 줄 | `import{AxesHelper as A,...,Vector3 as s}from"three"` |
| 마지막 줄 | `export{N as ArMarkerControls, ..., u as ArToolkitSource}` |
| 바깥 의존 | **`three` 하나뿐** |
| `import.meta.url` 사용 | 0건 |
| 외부 `.wasm` 파일 fetch | **없음** — `data:application/octet-stream;base64`로 안에 박혀 있다 |

`.wasm` 문자열이 4번 나오지만 전부 Emscripten의 `A.wasmBinary` 속성이고 경로가 아니다.
**번들러가 경로를 바꿔도 wasm 로딩이 깨지지 않는다** — 이게 가장 걱정했던 부분이었다.

## 2. 빌드 — 통과

vite 8.1.5 / three / urdf-loader 를 npm 으로 깔고, `ar-threex.mjs`만 파일 경로로 import.

```
✓ 14 modules transformed.
dist/assets/index-*.js   built in 219ms
```

`ArToolkitProfile`·`ArToolkitSource`·`ArToolkitContext`·`ArMarkerControls`·`ArSmoothedControls`
다섯 개 전부 번들에 들어갔다.

## 3. 용량 — JS 만 26% 준다

**첫 측정은 틀렸다.** `THREE.Group`만 import해서 `WebGLRenderer`가 트리셰이킹으로 빠져
gzip 633KB가 나왔다. 실제 화면이 쓰는 셋(`WebGLRenderer`·`OrbitControls`·`STLLoader`·
`URDFLoader`·`TubeGeometry`·`RingGeometry` 등)으로 다시 재야 의미가 있다.

| | raw | gzip |
|---|---|---|
| 지금 (importmap, vendor 8개 파일) | 3,805,871 | 1,043,250 |
| **Vite (현실적 import 셋)** | **2,270,777** | **769,801** |
| 차이 | −1.5MB | **−273KB (−26%)** |

절감분은 거의 전부 `three.core.js`(1.4MB) 트리셰이킹이다.
`ar-threex.mjs`는 webpack 덩어리라 셰이킹이 안 되고 gzip 606KB가 그대로 남는다.

**로딩 체감은 이걸로 안 바뀐다.** 첫 로딩 7.5MB 중 STL이 6.4MB이고 압축이 안 된다(D12).
Vite의 값어치는 용량이 아니라 importmap 제거와 파일 분리다 — 그 판단은 유지된다.

## 4. 덤 — `ColladaStub.js` 꼼수가 사라진다

`urdf-loader`는 `three/examples/jsm/loaders/ColladaLoader.js`를 **정적 import** 한다.
우리 메시는 전부 STL이라 쓰이지 않는데, importmap 방식에서는 그 지정자를 어디로든
매핑해야 해서 351B 스텁을 만들어 뒀다.

Vite에서는 npm 의 `three` 안에 실물이 있어 **그냥 해결된다.**
번들에 ColladaLoader 코드가 3곳 들어가지만(수 KB gzip), 스텁이라는 거짓말이 없어진다.

## 5. 죽은 파일 하나 — `web/js/loaders/TGALoader.js`

전수조사에서 나왔다. 538줄 / 11.8KB.

```
web/ar.html:18     "three/addons/loaders/TGALoader.js": "./js/loaders/TGALoader.js"
web/robot.html     같은 매핑
```

**두 곳의 importmap에 등록만 돼 있고, 어떤 모듈도 이 지정자를 import 하지 않는다.**
`URDFLoader.js`의 정적 import는 `three`·`STLLoader`·`ColladaLoader` 셋뿐이다.
Vite로 옮기면 지정자 개념이 없어져 자동으로 사라진다 — 파일도 같이 지운다.

## 남은 미확인

**빌드가 통과했다는 것은 모듈 해석이 된다는 뜻이고, 런타임이 된다는 뜻은 아니다.**
ARToolKit wasm 초기화와 카메라 정합은 브라우저에서만 확인된다. 그리고 카메라 권한은
자동화 환경에서 넘을 수 없다(`AR-DEBUG.md` §6).

→ 이관 완료 판정은 **폰에서 AR이 이관 전과 똑같이 동작하는 것**이다. 빌드 통과로 대체하지 않는다.

## 재현

```bash
mkdir vitecheck && cd vitecheck && npm install vite three urdf-loader
# ar-threex.mjs 를 ./vendor/ 로 복사하고 index.html + main.js 작성
npx vite build
```

측정 환경 — node v24.14.0 · vite 8.1.5 · darwin 25.3.0
