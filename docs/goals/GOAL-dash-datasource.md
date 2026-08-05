# GOAL-dash-datasource — 화면이 데이터 출처를 모르게 한다

사다리 1/4. 다음: [GOAL-dash-cycle-player.md](GOAL-dash-cycle-player.md).
**이 사다리는 관제화면을 "맵 편집기"에서 "관제화면"으로 옮기는 4칸이다.**

`SHARED-CORE.md` §4 와 `ARCHITECTURE.md` §확장성이 `Shared/data/datasource/` 를
**"데이터가 어디서 오는지 아는 유일한 곳"** 으로 선언했고 L3 완료판정 AC#4 가 여기 걸려 있는데,
**폴더가 비어 있다.** FR5·TurtleBot 은 각자 자기 것을 만들어 쓰는데 Dashboard 몫만 없다.
그래서 지표 화면이 21줄짜리 "미착수" 문구로 남아 있고, 배치안 저장이 경계를 우회해
`localStorage` 에 직접 박힌다.

## 골 한 줄

```
관제화면이 배치안과 지표를 datasource 한 곳에서만 받고 출처를 화면이 말한다
verified by datasource 왕복 헤드리스 확인 + `bash scripts/check/datasource.sh`(신설)
  + `bash scripts/check/all.sh` + `npm run build:dash`
while preserving 편집기 동작 전부(GOAL-editor-* 3칸) 와 `Shared/data/layout/` 스키마 불변.
details in docs/goals/GOAL-dash-datasource.md
```

## 1. Outcome

1. `Shared/data/datasource/index.js` 가 화면이 부르는 **유일한 문**이다 —
   `getLayouts()` · `getLayout(id)` · `putLayout(L)` · `deleteLayout(id)` · `getMetrics(layoutId)`
2. `mock.js` 가 **지금의 `scenes.js` 보관함을 감싼다.** 편집기 동작이 하나도 안 바뀐다 —
   씬 드롭다운 · 저장 · 되돌리기 · 프리셋 그대로
3. 응답이 `source` 를 싣고 헤더 배지가 **그 값**을 쓴다. `main.jsx:21` 의
   `const SOURCE = 'mock'` 하드코딩이 사라진다 (SR_24)
4. 지표 목업 2개가 `LAYOUT-METRICS-CONTRACT.md` §요구 모양대로 나온다 —
   **필수 둘**(`throughputPerHour` · `cycleTimeSec.mean`) + 선택 일부를 **일부러 빼서** 넣는다
5. **`scenes.js` 에서 저장 함수를 뗀다** — `loadStore`/`saveStore`/`read` 가 datasource 로 가고
   `scenes.js` 에는 **팩토리만**(`newScene`·`uniqueName`·`nextSceneId`) 남는다.
   화면은 팩토리를 계속 써도 되고, **저장은 datasource 로만** 한다
6. `scripts/check/datasource.sh` 신설 — 화면에서 `fetch`·`localStorage` 0건을 게이트가 지킨다.
   **경계는 규약이 아니라 게이트가 지킨다** (`layout.sh` 가 증명한 것)

## 2. Verification surface

```bash
# ① 화면이 출처를 모른다
grep -rn "localStorage\|fetch(" Dashboard/src/                    # → 0건
grep -c "datasource" Dashboard/src/features/layout/LayoutEditor.jsx   # → >= 1

# ② 왕복 — put 한 것이 get 으로 같게 나오나 · 지표 2건 · source 값
node --input-type=module -e "…"   # datasource.sh 안에 넣는다

# ③ 게이트·빌드
bash scripts/check/datasource.sh   # → 통과
bash scripts/check/all.sh          # → 전체 통과
npm run build:dash                 # → 성공
```

아티팩트 — `docs/evidence/` 에 **동작 불변 기록**: 씬을 만든다 → 물건을 옮긴다 →
새로고침 → 남아 있다 → `⌘Z`. **리팩터 전과 화면이 같다는 것을 눈으로 본 기록이 없으면 완료가 아니다.**

## 3. Constraints (후퇴 금지)

- **편집기 동작 불변** — GOAL-editor-copy · undo-save · coord-input 의 §2 검증이 계속 green
- `Shared/data/layout/` 스키마·값 불변 (D17)
- `Shared/` 에 **화면·React 를 두지 않는다** (SHARED-CORE §Shared 에 넣는 기준)
- 저장 실패가 편집을 막지 않는다 (GOAL-editor-undo-save §3 유지)
- **지표를 우리가 계산하지 않는다** — 목업도 "받은 값"의 모양이지 산출식이 아니다
- 새 의존성 0

## 4. Boundaries

- 허용 — `Shared/data/datasource/**` · `Dashboard/src/**` · `scripts/check/datasource.sh` ·
  `docs/evidence/**` · **`Shared/data/layout/scenes.js` (저장 함수 이관만)**
- 금지 — `Shared/view3d/**` · `Shared/data/layout/{schema,presets,catalog}.js` ·
  `AR/**` · `FR5/**` · `TurtleBot/**`

**"지금 보던 배치안"을 어디에 두나** — 저장소가 아니라 **URL**(`?scene=s1`)에 둔다.
그건 데이터가 아니라 *이 탭이 무엇을 보고 있나*이고, `SHARED-CORE.md` §config 가 이미
URL 파라미터를 그 용도로 쓴다(`?marker=lab-a3`). 덤으로 배치안 링크가 공유 가능해진다.

## 5. 미니멀 사다리 적용 기록

① 필요한가 — 그렇다. 문서 2개가 SSOT 로 선언했는데 **빈 폴더**이고, 그 빈 폴더가
   L3 를 막고 있다
② 이미 있나 — **있다. 같은 패턴이 이 저장소에서 두 번 돈다** —
   `FR5/src/data/datasource/index.js` · `TurtleBot/src/data/datasource/index.js`.
   둘 다 `export { datasource } from './http.js'` **한 줄**이다. 그대로 미러한다
③④ 표준·네이티브로 끝난다. 상태관리 라이브러리·IndexedDB 안 쓴다
⑦ **저장 방식을 다시 짜지 않는다** — `localStorage` 그대로 `mock.js` 안으로 옮길 뿐이다.
   같이 고치면 "출처 격리"와 "저장 재작성" 두 실패가 한 diff 에서 난다

**천장(ceiling)** — 이 골이 끝나도 저장은 여전히 **브라우저 한 대**다. 바뀌는 것은
*화면이 그 사실을 모르게 된 것*뿐이다. 팀 공유는 D46(이관 H)이고, 그때 바뀌는 것은
`index.js` 의 **한 줄**이다.

**이 골은 관문 논쟁과 무관하다** — Dashboard 가 파일만 읽든(A) 자기 브리지를 갖든(B)
FR5·TB 를 읽기 전용으로 합류하든(C) **이 골의 모양은 같다.** 그래서 결정을 기다리지 않는다.

## 6. Blocked stop condition

- 저장을 서버로 올리는 설계가 필요해지면 멈춘다 — 그건 이 골이 아니라 이관 H(D46)다
- `getMetrics` 의 실제 전달 방법을 정해야 진행이 안 되면 멈춘다 — 목업으로 서는 것이
  이 골의 전제다 (계약 §팀원과 맞춰야 할 것 넷은 아직 회신 전)
- 무진전 3패스면 blocked
- 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실

## 7. 실행 기록

**2026-08-04 · Claude Code · 패스 1 → `ready-for-review` · 골 닫음**

| 검증 | 기대 | 결과 |
|---|---|---|
| ① 화면이 출처를 안다 | 0건 | **0건** (주석·`fr5.hint.*` 제외) |
| ② 왕복 · 계약 5개 · 목록 모양 | 통과 | **통과** — 넣고 꺼내고 지운다 |
| ③ `index.js` 코드 줄 | ≤2 | **1줄** |
| ④ 지표 목업 2건 · 선택 결손 1건 | 있음 | **있음** (`B` 에서 5개 뺌) |
| ⑤ `bash scripts/check/datasource.sh` | 통과 | **통과** · **주입 2건 다 잡음** |
| ⑥ `bash scripts/check/all.sh` | 전체 통과 | **전체 통과** |
| ⑦ `npm run build:dash` | 성공 | **성공** (350ms) |
| ⑧ 실렌더 왕복 | 동작 불변 | **17/17** (`dash-web-verify.mjs` 신설) |

- **재현됨** — Outcome 1~6 전부. 씬 만들기·팔레트·되돌리기·삭제·저장실패가
  경계를 넣기 전과 같은 결과를 낸다
- **근사됨** — 없음
- **막힘** — 없음
- **불확실** — 손으로 안 눌렀다 · 폰 · `?scene=` 링크를 **받는 쪽**(저장이 아직 브라우저 한 대)

**덤으로 나온 것** — 검증 스크립트 첫 판의 실패 5건이 **코드가 아니라 시험의 결함**이었다
(팔레트 첫 칸이 소품이 아니라 문). 실패를 보자마자 코드를 고쳤으면 멀쩡한 코드를 망가뜨렸다.

바꾼 것 — `Shared/data/datasource/{index,mock}.js`(신설) · `Shared/data/layout/scenes.js`(저장 함수 제거) ·
`LayoutEditor.jsx` · `main.jsx` · `scripts/check/{datasource.sh,dash-web-verify.mjs}`(신설)

근거 — `docs/evidence/2026-08-04/datasource.md`

## 참조

- `docs/ref/contract/SHARED-CORE.md` §4 · `docs/ref/contract/LAYOUT-METRICS-CONTRACT.md` §생산성 지표
- `docs/ref/plan/MILESTONES.md` L3 AC#4 · `docs/status/GAP-MATRIX.md` (저장이 브라우저 한 대 안에만)
