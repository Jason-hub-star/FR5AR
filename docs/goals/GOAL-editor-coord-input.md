# GOAL-editor-coord-input — 숫자로 정확히 놓는다

사다리 3/3. 앞: [GOAL-editor-undo-save.md](GOAL-editor-undo-save.md).
끌기는 100mm 격자에 붙어서 **그 사이 값을 못 넣는다.** 실측 치수가 나오면 바로 막힌다.

## 골 한 줄

```
고른 물건의 x·y·회전을 숫자로 직접 넣을 수 있고 타이핑 중 값이 되돌아가지 않는다
verified by 빈값·범위밖 입력 헤드리스 확인 + `bash scripts/check/all.sh` + `npm run build:dash`
while preserving 앞 골 2개의 검증 green 과 validateLayout 통과.
details in docs/goals/GOAL-editor-coord-input.md
```

## 1. Outcome

1. 물건을 고르면 **x · y · 회전**을 숫자로 넣을 수 있다
2. **타이핑 중에 값이 되돌아가지 않는다.** `8` 을 치고 `0` 을 치려는 순간 화면이 `8` 을 지우면 못 쓴다
3. 방 밖 좌표는 커밋되지 않는다 — `floor.widthMm` · `depthMm` 안으로 자른다
4. 빈 문자열·문자 입력에 화면이 죽지 않는다
5. 입력으로 바꾼 값도 **되돌리기 한 단계에 잡힌다** (골 2와 같은 스택)

## 2. Verification surface

```bash
# ① 입력칸이 셋 생겼나
#    선언은 재사용 컴포넌트 하나(`NumBox`)라 `type="number"` 를 세면 1이 나온다.
#    **세어야 할 것은 쓰인 횟수다** — 같은 칸을 세 번 복사하는 쪽이 나쁜 코드다.
grep -c '<NumBox' Dashboard/src/features/layout/LayoutView.jsx  # → >= 3

# ② 범위 자르기가 스키마에서 오나 (매직넘버 금지)
grep -n "floor.widthMm\|floor.depthMm" Dashboard/src/features/layout/*.jsx   # → >= 1

# ③ 게이트·빌드
bash scripts/check/all.sh        # → 전체 통과
npm run build:dash               # → 성공
```

아티팩트 — `docs/evidence/` 에 **입력 실렌더 기록**:
`8` → `80` → `800` 을 차례로 쳤을 때 중간에 안 튀는 것을 눈으로 본 기록.

## 3. Constraints (후퇴 금지)

- **골 1·2 의 §2 검증이 계속 green** (누적)
- `validateLayout()` 을 통과하는 값만 커밋한다 — 편집 중 잠깐 틀린 건 정상이고, **저장할 때만 막는다**
- 끌기·회전 동작이 그대로 산다
- 단위는 **mm·도** 하나뿐 (하드룰 5 — 변환 함수를 여기 새로 만들지 않는다)

## 4. Boundaries

- 허용 — `Dashboard/src/features/layout/**` · `Dashboard/src/screens/main.css` · `docs/evidence/**`
- 금지 — `Shared/**` · `AR/**` · **새 의존성 0**

## 5. 미니멀 사다리 적용 기록

② 재사용 검토 — `AR/src/features/ui/number-pair.js` 가 **같은 버그를 이미 고쳐 뒀다.**
   다만 그건 **바닐라 DOM + range·number 쌍**이고 대시보드는 React 다. 슬라이더도 필요 없다.
   → **코드는 못 가져온다. 가져오는 건 규칙 한 줄이다** —
   **"타이핑 중(`onChange`)에는 입력칸의 `value` 를 절대 되쓰지 않는다. 자르기는 `onBlur` 에서 한다."**
⑦ 그래서 최소 코드다. `<input type="number">` 3개 + 커밋 함수 1개. 새 파일 0.

## 6. Blocked stop condition

- 회전을 90° 스냅이 아니라 자유 각도로 요구받으면 멈추고 묻는다 —
  `interaction.js` 는 벽에 붙이는 가구를 전제로 90° 만 돈다. 전제가 바뀌는 결정이다
- 무진전 3패스면 blocked
- 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실

## 7. 실행 기록

**2026-07-31 · Claude Code · 패스 3 → `ready-for-review` · 골 닫음 (폰 폭은 미확인)**

| 검증 | 기대 | 결과 |
|---|---|---|
| ① `<NumBox` 사용 | ≥3 | **3** |
| ② 방 치수에서 범위 | ≥1 | **2** (`floor.widthMm` · `floor.depthMm`) |
| ③ `bash scripts/check/all.sh` | 전체 통과 | **전체 통과** |
| ④ `npm run build:dash` | 성공 | **성공** (259ms) |
| ⑤ 입력 실렌더 기록 | 있음 | **`evidence/2026-07-31/dashboard-l1-editor.md`** (11항목) |

- **재현됨** — Outcome 1~5 전부. `8`→`80`→`800`→`8000` 이 안 튀는 것, 99999→12000 자르기,
  3333→3300 격자, 45→90 스냅, `⌘Z` 연동을 브라우저에서 측정
- **근사됨** — 실제 키보드가 아니라 **합성 `input`·`focusout`** 으로 쳤다.
  브라우저 창이 포커스를 안 가져 `blur()` 가 안 먹었다
- **막힘** — **폰 폭 확인.** 창이 최대화되어 `resize_window` 가 더는 안 먹었다.
  입력칸 셋이 늘어 선택 패널이 445px 로 넓어졌으므로 **좁은 폭에서 접히는 모양은 모른다**
- **불확실** — 사파리·파이어폭스 · 화살표 키·스피너 경로

**패스 1~2 가 놓치고 실렌더가 잡은 것 셋** — 셋 다 코드 게이트를 통과한 상태였다.
1. **회전이 항상 0° 로 떴다** — `userData.item` 이 `{kind,id,type}` 만 담는다.
   Boundaries 가 `Shared/**` 를 막으므로 거기를 안 고치고 **배치안에서 직접 읽게** 했다
2. **되돌린 뒤 패널만 옛 값**을 들고 있었다 — `picked` 는 고른 순간의 사본이다
3. **회전만 바꿔도 좌표가 옛날로 되돌아갔다** — 커밋에 고른 순간 좌표가 같이 실렸다

셋의 뿌리는 하나다 — **"화면이 보여주는 값의 정본이 어디인가"** 를 안 정한 것.

**재사용 판정 정정** — 착수 전에는 `number-pair.js` 를 "그대로 쓴다" 고 적었으나,
바닐라 DOM + 슬라이더 쌍이라 **코드는 못 가져왔다.** 가져온 것은 규칙 한 줄이다.

바꾼 것 — `LayoutView.jsx`(`NumBox` · `shown` 파생 · `commitField`) · `main.css`(`.numbox`)

## 참조

- `Shared/data/layout/schema.js` (`validateLayout`) · `docs/ref/CODING-CONVENTIONS.md` (단위)
