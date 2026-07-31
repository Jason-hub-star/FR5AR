# GOAL-editor-copy — 메인뷰 문구를 사실로 되돌리고 해요체로 바꾼다

사다리 1/3. 앞선 골 없음. 다음은 [GOAL-editor-undo-save.md](GOAL-editor-undo-save.md).
근거는 2026-07-31 `/감사` — P0 2건 · P2 5건.

## 골 한 줄

```
메인뷰에서 "되는 기능을 안 된다고 적은 문장" 0건 · 사용자에게 보이는 문장 전부 해요체
verified by 금지어 grep 0건 + 신규 문구 grep + `bash scripts/check/all.sh` + `npm run build:dash`
while preserving Shared/data 스키마 불변과 출처 배지 상시 노출.
details in docs/goals/GOAL-editor-copy.md
```

## 1. Outcome

1. `Dashboard/src` 어디에도 **"드래그 편집은 다음 단계"** 류 문장이 없다 — 끌기는 이미 된다
2. 화면에 뜨는 문장이 전부 **해요체**다. 개발자가 개발자에게 하는 설명(`"어긋날 수 없다"`)은 화면에서 사라진다
3. 사용법 힌트가 **처음 한 번만** 뜬다. 닫으면 다시 안 뜬다
4. 되돌리기 버튼이 뜨고 지는 순간에 **A/B 세그먼트가 좌우로 안 튄다** (`main.css` `.seg` 중복 규칙 제거)
5. 폰에서도 안내가 데스크톱과 같은 양이다 — 지금은 폰이 더 적다

## 2. Verification surface

```bash
# ① 거짓·개발자 문구 0건
grep -rn "다음 단계(L1)\|다음이다 (L1)\|어긋날 수 없다\|교착이 나는 자리" Dashboard/src   # → 0

# ② 해요체 문구가 들어왔나 (3개 이상)
grep -c "닿아요\|막히는 곳\|옮겨보세요" Dashboard/src/features/layout/*.jsx              # → >= 3

# ③ .seg 규칙이 하나뿐인가 (`{` 는 대괄호로 감싼다 — 일부 grep 프록시가 정규식으로 읽는다)
grep -cE '^\.seg [{]' Dashboard/src/screens/main.css                                     # → 1

# ④ 게이트·빌드
bash scripts/check/all.sh        # → 전체 통과
npm run build:dash               # → 성공
```

아티팩트 — `docs/evidence/2026-07-31-dashboard-copy.md`
(실렌더 판정. **골 경계의 사람 승인 게이트**다. 코드 게이트만으로 완료 선언하지 않는다)

## 3. Constraints (후퇴 금지)

- `Shared/data/layout/` 의 스키마·값을 **건드리지 않는다** — 여기가 갈라지면 AR과 배치가 어긋나고 양쪽 다 정상으로 보인다 (D17)
- 출처 배지(`.source`)는 항상 보인다 (SR_24) — 목업을 실측으로 오인하는 게 가장 비싼 사고다
- 폰 820px 이하에서 3D 칸 높이가 줄지 않는다
- `bash scripts/check/all.sh` green 유지

## 4. Boundaries

- 허용 — `Dashboard/src/**` · `docs/evidence/**`
- 금지 — `Shared/data/**` · `AR/**` · **새 의존성 0** · 새 파일 0

## 5. Iteration policy

패스마다 §2 전체 실행 → 실패 항목만 최소 변경으로 재시도. 무진전 3패스면 blocked.

## 6. Blocked stop condition

- 실렌더가 불가능한 환경이면 코드 게이트까지만 하고 **`ready-for-review`** 로 멈춰 보고한다 — `ready-to-share` 로 적지 않는다
- 문구를 바꾸려면 `Shared/data` 를 고쳐야 하는 상황이 나오면 멈춘다 (Constraints 충돌)
- 보고 형식: 재현됨 / 근사됨 / 막힘 / 불확실

## 7. 실행 기록

**2026-07-31 · Claude Code · 패스 2 → `ready-for-review` · 골 닫음**

| 검증 | 기대 | 결과 |
|---|---|---|
| ① 거짓·개발자 문구 | 0 | **0** |
| ② 해요체 문구 | ≥3 | **4** |
| ③ `.seg` 규칙 | 1 | **1** |
| ④ `bash scripts/check/all.sh` | 전체 통과 | **전체 통과** |
| ⑤ `npm run build:dash` | 성공 | **성공** (144ms) |
| ⑥ 실렌더 evidence | 있음 | **`evidence/2026-07-31-dashboard-copy.md`** |

- **재현됨** — Outcome 1~5 전부. 세그먼트 좌표(1246→1246) · 안내 플래그(`"1"`) ·
  폰에서 편집 전후 캔버스 415→415px 를 브라우저에서 측정
- **근사됨** — 폰 검증을 **528px 창**으로 했다. 크롬 최소 창 폭이라 390px 실기를 못 만들었다.
  터치가 아니라 합성 PointerEvent 로 끌었다
- **막힘** — 없음
- **불확실** — 사파리·파이어폭스. 실제 폰 손가락 제스처

**패스 1이 놓치고 패스 2(실렌더)가 잡은 것 둘** — 코드 게이트는 둘 다 통과시켰다.
1. 폰에서 저장 배지가 머리줄을 두 줄로 접어 **3D 를 44px 먹었다** → 폰에서 제목을 숨겨 해결
2. 선택 패널이 시점·회전 버튼을 **덮었다** → 패널을 아래로 + 물건을 고르면 안내가 자동으로 접힘

바꾼 것 — `LayoutEditor.jsx`(머리주석·헤더·숫자줄) · `LayoutView.jsx`(안내 1회·선택 시 자동 접힘) ·
`main.css`(`.seg` 중복·`.note`·`.narrow/.wide` 제거, `.unsaved` 추가, 폰 제목 숨김·선택 패널 하단)

## 참조

- `docs/status/GAP-MATRIX.md` · `docs/ref/CONSOLE-REACT.md` · `docs/status/DECISION-LOG.md` D17
