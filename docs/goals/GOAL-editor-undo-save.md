# GOAL-editor-undo-save — 편집이 사라지지 않게 한다

사다리 2/3. 앞: [GOAL-editor-copy.md](GOAL-editor-copy.md) · 다음: [GOAL-editor-coord-input.md](GOAL-editor-coord-input.md).
GAP-MATRIX 의 **"편집한 배치안이 저장되지 않는다"** 를 닫는 골이다.

## 골 한 줄

```
배치 편집분이 새로고침 뒤에도 남고 한 단계씩 되돌아간다
verified by localStorage 왕복 헤드리스 확인 + `bash scripts/check/all.sh` + `npm run build:dash`
while preserving GOAL-editor-copy 검증 green 과 Shared/data 스키마 불변.
details in docs/goals/GOAL-editor-undo-save.md
```

## 1. Outcome

1. `⌘Z` / `Ctrl+Z` 와 화면 버튼으로 **한 단계씩** 되돌아간다. 지금은 "전부 날리기" 하나뿐이다
2. 새로고침해도 편집분이 남는다
3. 저장 상태가 화면에 **글자로** 보인다 — 지금은 저장이 없는데 화면이 아무 말도 안 해서 저장된 줄 안다
4. **A/B 배치안별로 따로** 저장된다 (A를 고치고 B로 갔다 와도 A가 그대로)
5. 저장이 실패해도 편집은 계속된다 — 사파리 프라이빗·용량 초과에서 화면이 죽지 않는다

## 2. Verification surface

```bash
# ① 네이티브 저장을 쓰나 (새 의존성 없이)
grep -c "localStorage" Dashboard/src/features/layout/LayoutEditor.jsx   # → >= 1

# ② 헤드리스 노출 — main.jsx:49 의 window 노출 관례와 같은 방식
grep -n "window" Dashboard/src/features/layout/LayoutEditor.jsx        # → 편집상태 노출 1건

# ③ 게이트·빌드
bash scripts/check/all.sh        # → 전체 통과
npm run build:dash               # → 성공
```

아티팩트 — `docs/evidence/` 에 **왕복 실렌더 기록**:
물건을 옮긴다 → 새로고침 → 남아 있다 → `⌘Z` → 한 개만 되돌아간다.
**이 순서를 눈으로 본 기록이 없으면 완료가 아니다.**

## 3. Constraints (후퇴 금지)

- **GOAL-editor-copy 의 §2 검증이 계속 green** (누적 회귀 방지)
- `Shared/data/layout/` 스키마·값 불변 (D17)
- 저장 실패가 편집을 막지 않는다 — `try/catch` 로 삼키고 화면은 계속 돈다
- `bash scripts/check/all.sh` green 유지

## 4. Boundaries

- 허용 — `Dashboard/src/features/layout/**` · `Dashboard/src/screens/main.css` · `docs/evidence/**`
- 금지 — `Shared/**` · `AR/**` · **새 의존성 0**

## 5. 미니멀 사다리 적용 기록

① 필요한가 — 그렇다. 저장이 없어 편집기가 실사용을 못 한다 (GAP-MATRIX OPEN)
② 이미 있나 — 없다
③④ **네이티브 `localStorage` 로 끝난다.** 상태관리 라이브러리·IndexedDB 안 쓴다
⑦ 되돌리기는 `edits` 를 스택 배열로 바꾸는 것뿐 — 새 파일 0

**천장(ceiling)** — 이 골의 저장은 **브라우저 한 대 안에서만** 산다. 팀 공유·기기 간 동기화는
`Shared/data/config/` 슬롯(이관 H단계)이 할 일이고, 이 골은 거기로 가는 중간 발판이다.

## 6. Blocked stop condition

- 저장 키 모양을 정하려면 `Shared/data/config/` 슬롯 계약을 먼저 정해야 하는 상황이면 멈춘다 —
  그건 이 골이 아니라 이관 H 단계다
- 무진전 3패스면 blocked
- 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실

## 7. 실행 기록

**2026-07-31 · Claude Code · 패스 1 → `ready-for-review` · 골 닫음**

| 검증 | 기대 | 결과 |
|---|---|---|
| ① `localStorage` 사용 | ≥1 | **2** (읽기·쓰기) |
| ② 헤드리스 노출 | 1건 | **`window.__fr5edit`** |
| ③ `bash scripts/check/all.sh` | 전체 통과 | **전체 통과** |
| ④ `npm run build:dash` | 성공 | **성공** (136ms) |
| ⑤ 왕복 실렌더 기록 | 있음 | **`evidence/2026-07-31/dashboard-l1-editor.md`** (9항목) |

- **재현됨** — Outcome 1~5 전부. 특히 `⌘Z` 가 편집 직전 스냅샷과 **문자열까지 일치**하게
  복원하는 것과, A↔B 를 오가도 A 편집이 그대로인 것을 브라우저에서 측정
- **근사됨** — Outcome 5(저장 실패): `localStorage.setItem` 을 던지게 갈아끼워 재현했다.
  **사파리 프라이빗을 실제로 띄우지 않았다**
- **막힘** — 없음
- **불확실** — 사파리·파이어폭스 · 실제 손가락 터치 · 되돌리기 50개 상한

**덤으로 발견 (고치지 않음)** — `pointerup` 유실 시 `dragging` 이 물린 채 남아 편집기가 멈춘다.
합성 이벤트에서만 재현됐고 실제 입력은 `setPointerCapture` 가 막는다 →
GAP-MATRIX 에 OPEN 으로만 올렸다.

바꾼 것 — `LayoutEditor.jsx`(저장·되돌리기 스택·키보드·헤드리스 노출) · `main.css`(`.saved` 추가)

## 참조

- `docs/status/GAP-MATRIX.md` (편집한 배치안이 저장되지 않는다) · `docs/ref/contract/SHARED-CORE.md`
