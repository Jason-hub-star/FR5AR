# shared — AR 과 Dashboard 가 같이 쓰는 것

**여기가 갈라지면 프로젝트가 갈라진다.** 두 화면이 다른 배치안을 보는데
양쪽 다 정상으로 보인다 — 에러가 안 난다 (D17).

- `data/` — 데이터·계약. **프레임워크 무관, 렌더링 없음**
  (`layout` `units` `config` 는 있다. `datasource` 는 아직 빈 폴더 — **L1 착수 때 채운다**)
- `view3d/` — 바닐라 three 공용. **React 를 쓰지 않는다**
- `tokens/` — 색·간격·타이포·상태 색. **컴포넌트 스타일은 공유하지 않는다**
- **화면을 두지 않는다** — 화면은 `AR/` · `Dashboard/` 안에만
- **배치안 원점은 실험실 바닥이다. 로봇 베이스가 아니다** — 팔 위치가 변수라서 (SR_23)
- **단위 변환은 `data/units/` 한 곳** (하드 룰 5)
- `data/config/*.json` 은 `.env` 에서 굽는 **산출물**이다. 손으로 고치지 않는다

## 폴더

| 경로 | 무엇 |
|---|---|
| `assets/` | URDF, 마커, 그리퍼 STL 등 정적 자산 |
| `data/` | `layout` 배치안 · `units` 단위변환 · `config` 굽힌 설정 · `datasource` (빈 폴더) |
| `tokens/` | 색·간격·타이포 CSS 변수 |
| `view3d/` | 바닐라 three.js 3D 뷰 모듈 |

읽을 것 — `docs/ref/SHARED-CORE.md`
