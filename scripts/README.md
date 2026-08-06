# scripts — 무엇을 어디에 두나

**루트에 스크립트를 두지 않는다.** 모든 스크립트는 카테고리 폴더 안에 들어간다.
이 README만 루트에 남는다.

## 지금 있는 것

```
scripts/
├── README.md
├── check/                      검증 게이트 — 실패하면 exit 1
│   ├── all.sh                    아래 전부를 순서대로 실행 (진입점)
│   ├── harness.sh                커맨드 0 · 스킬 16 · 훅 2 · settings 연결
│   ├── docs.sh                   필수 문서 · INDEX 등재 · 깨진 링크 · Unity 배너
│   ├── assets.sh                 URDF·메시 존재와 삼각형 수
│   ├── consts.sh                 기준값 표 ↔ 실제 상수 대조 (드리프트)
│   ├── docs-weight.sh            문서 무게 — 쌓이는 것만 재서 임계 초과 시 알린다
│   ├── fr5-unit.sh               FR5 브리지 단위 테스트 (safety.py 순수 함수 · unittest)
│   ├── motion.sh                 자세 — 이름 정합 · NaN · j1 각속도 상한 · 화면에 안 박혔나
│   ├── scenario.sh               시나리오 — 왕복 · 사건 칸(좌표·관절 금지) · 프리셋 재생
│   ├── xr-place.sh               겹치기 놓기 계산 — 두 모서리·히트 분류·벽 법선·훑기·준비도 (1초)
│   ├── xr-web-verify.mjs         WebXR 화면 — ①놓기 계산 ②`화면` 모드 실렌더. `--pure` 면 ①만
│   └── cam-web-verify.mjs        글로벌 카메라 겹치기 실렌더 — 사진 재검출 ↔ 투영 픽셀 대조
├── build/                      설정·산출물 생성
│   └── config.mjs                .env → Shared/data/config/*.json (검증 포함)
├── dev/                        개발 중 사람이 손으로 부른다
│   ├── serve.sh                  Vite dev 서버 (ar | dash)
│   └── rotate-decisions.mjs      DECISION-LOG-CURRENT 초과분을 본문으로 이관 (`--write` 로 실행)
├── assets/                     자산 복사·변환
│   ├── sync-from-unity.sh        유니티에서 URDF·메시 가져오기
│   ├── make-marker-sheet.py      AR 마커 인쇄 시트 생성 (자가검사 포함)
│   └── make-marker-test-images.py  마커 검출 실측용 합성 이미지 117장
└── map/                        실제 맵 + 글로벌 카메라 (한 워크플로 = 한 폴더)
    ├── make-tags.py              AprilTag 36h11 + ChArUco 인쇄 시트 · tags.json (제원 SSOT)
    ├── cam-lock.sh               폰 카메라 해상도·초점·줌 잠금 + 되읽어 확인 (찍기 전 매번)
    ├── aim.py                    카메라 위치 잡기 — 실시간 px/칸 판정 (찍기 전에 쓴다)
    ├── capture.py                웹캠 촬영 (오토포커스·해상도 잠금)
    ├── intrinsics.py             ChArUco 사진 → 카메라 화각·왜곡
    ├── extrinsics.py             태그 사진 + 실측 좌표 → labToCam
    └── check-calib.sh            게이트 — all.sh 가 자동으로 집어 간다
```

## 카테고리

| 폴더 | 담당 | 이름 규칙 | 상태 |
|---|---|---|---|
| `check/` | 검증·게이트. 실패 시 **exit 1** | 검사 대상 이름 그대로 | 사용 중 |
| `dev/` | 개발 중 실행. 되돌릴 수 있는 것만 | 동사 | 사용 중 |
| `assets/` | 자산 복사·변환 | 동사 | 사용 중 |
| `build/` | 설정·산출물 생성. **입력이 틀리면 쓰지 않고 멈춘다** | 산출물 이름 | 사용 중 |
| `robot/` | 로봇 연결·모의·브링업 | 동사 또는 대상 | 아직 없음 — 첫 파일 생길 때 만든다 |
| `map/` | 실제 맵·글로벌 카메라 캘리브레이션 | 파이프라인 단계 이름 | 사용 중 |
| `deploy/` | 배포·터널 | 동사 또는 대상 | 사용 중 — `fr5-ubuntu.sh` (맥 빌드 → rsync → 서비스 재시작 → 로봇 재연결) |

## 글로벌 카메라 캘리브레이션 — 세 스크립트가 한 줄로 이어진다

```
map/make-tags.py                                 →  인쇄물 (1회)
map/cam-lock.sh                                  →  해상도·초점·줌 잠금 (찍기 전 매번)
map/aim.py                                       →  카메라 자리 (찍기 전 · 화면 보고)
map/capture.py charuco  →  map/intrinsics.py     →  렌즈  (카메라당 1회)
map/capture.py tags     →  map/extrinsics.py     →  위치  (카메라를 건드릴 때마다)
                           map/check-calib.sh    →  게이트
```

`cam-lock.sh` 가 맨 앞인 이유 — 해상도·초점·줌이 바뀌면 **뒤의 결과가 전부 무효**인데,
앱을 재시작하거나 케이블을 다시 꽂으면 그 값들이 조용히 되돌아간다. 실측으로
`quality` 가 49(태그 검출을 깎는 압축)로, `focusmode` 가 자동으로 돌아가는 것을 봤다.

**순서를 바꿀 수 없다.** 내부 파라미터가 나쁘면 외부가 조용히 틀어진다 — 합성 검증에서
내부 fy 를 1.3% 틀리게 넣었더니 카메라 높이가 2.4m → 4.4m 로 나왔다. 그래서 두 build
스크립트 모두 재투영 오차 상한을 넘으면 **쓰지 않고 멈춘다.** 값이 없는 편이 낫다.

인쇄물은 `Shared/assets/tag/`, 보드 제원은 같은 폴더의 `tags.json` 이 단일 출처다.
사진과 실측 서식은 `calib-shots/` (gitignore) — 결론만 `Shared/data/config/global-cam.json` 으로 간다.

**카테고리 폴더는 `check-*.sh` 로 자기 게이트를 내놓는다.** `check/all.sh` 가
`scripts/*/check-*.sh` 도 같이 돌린다 — 도메인 게이트를 `check/` 로 떼어 놓으면
워크플로가 두 폴더로 갈라지고, 손으로 불러야 하는 게이트는 결국 안 돈다.

**폴더는 첫 파일이 생길 때 만든다.** 빈 폴더를 미리 파두지 않는다.
어디에도 안 맞으면 카테고리를 새로 만들고 이 표에 한 줄 추가한다 — 루트에 두지 않는다.

## 규칙 4개

1. **`check/`는 실패 시 반드시 exit 1.** 출력만 하고 0을 내면 게이트가 아니라 소음이다.
2. **경로는 스크립트 위치 기준으로 계산한다.** 어디서 실행해도 같아야 한다.
   ```bash
   ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
   ```
3. **첫 줄 주석 한 줄로 목적을 적는다.** 이 README에는 트리에만 올린다.
4. **기준값은 스크립트 안에 상수로 두고 주석에 출처를 적는다.** 바뀌면 같이 고친다.

## 실행

```bash
bash scripts/check/all.sh              # 전부 (훅이 자동으로도 부른다)
bash scripts/check/harness.sh          # 하나만
bash scripts/dev/serve.sh              # AR 띄우기 (Vite dev)
bash scripts/assets/sync-from-unity.sh # 유니티 모델 다시 받기
node scripts/build/config.mjs          # .env → Shared/data/config/*.json
node scripts/build/config.mjs --check  # 쓰지 않고 대조만 (게이트가 쓴다)
```

## 설정은 `.env` 가 SSOT 다

**브라우저는 환경변수를 읽을 수 없다.** 그래서 `.env` 를 사람이 고치는 유일한 곳으로 두고
`scripts/build/config.mjs` 가 `Shared/data/config/*.json` 으로 굽는다. 브라우저는 그 JSON 을 fetch 한다.

- `Shared/data/config/*.json` 은 **산출물이다 — 직접 고치지 않는다.** gitignore 대상
- 형식은 `.env.example` (커밋됨). `cp .env.example .env` 로 시작한다
- 셸 환경변수가 `.env` 를 이긴다: `FR5_MARKER_BARCODE=5 node scripts/build/config.mjs`
- **값 검증이 이 스크립트의 본체다.** 바코드가 인쇄물과 다르면 화면에 아무것도 안 뜨고
  콘솔 에러도 없다. 그래서 범위·형식·**원본 존재**까지 보고 틀리면 멈춘다
- 손으로 JSON 을 고치면 `check/consts.sh` 가 드리프트로 잡는다

## 기준값이 있는 곳

숫자를 바꿀 일이 생기면 여기부터 본다. **안 고치면 게이트가 거짓으로 실패한다.**

| 스크립트 | 상수 | 현재값 | 언제 바꾸나 |
|---|---|---|---|
| `check/harness.sh` | `WANT_COMMANDS` `WANT_SKILLS` | 0 / 16 | 스킬을 더 만들거나 합칠 때 |
| `check/assets.sh` | `WANT_ARM_TRIS` `WANT_GRIP_TRIS` | 58482 / 70102 | 유니티 원본 모델이 바뀔 때 |
| `check/docs.sh` | `REQUIRED` 배열 | 15개 | SSOT 문서를 추가·삭제할 때 |
| `check/fr5-unit.sh` | 상수 없음 — 테스트가 스스로 기준 | 29 케이스 | `safety.py` 조건을 더하면 테스트도 더한다 |
| `check/motion.sh` | 상수 없음 — `Shared/data/motion/presets.js`·`limits.js` 가 기준 | 자세 10개 · 관절 한계 6쌍(URDF 대조) | 자세를 더하거나 URDF 가 바뀔 때 |
| `check/scenario.sh` | 상수 없음 — `Shared/data/scenario/presets.js` 가 기준 | 사건 13개 · 49초 · 거부 10종 | 시나리오 프리셋을 더하거나 사건 칸을 늘릴 때 |
| `assets/make-marker-sheet.py` | `SHEETS` · `QUIET_RATIO_MIN` | A4 170/14mm · A3 240/20mm · 하한 6% | 마커 크기·용지를 바꿀 때 |
| `map/make-tags.py` | `SHEETS` · `QUIET_RATIO` · `TAG_IDS` | A4 160mm · 1/8 · id 0~4 | 태그 크기·용지를 바꿀 때 |
| `map/aim.py` | `SAFE` · `RISKY` | 5.0 · 3.0 px/칸 | 검출 한계 실측이 갱신될 때 |
| `build/config.mjs` | `AVAILABLE_BARCODES` | 2 · 3 · 5 | 바코드 원본을 더 받거나 지울 때 |
| `check/docs-weight.sh` | `CAP_ENTRY_*` `CAP_STATUS_*` | 80/110 · 120/160 | 진입 문서 상한을 바꿀 때 |
| `check/docs-weight.sh` | `CAP_DOC_*` `CAP_INDEX_*` | 300/450 · 45/60 | 개별 문서·INDEX 행 상한 |
| `check/docs-weight.sh` | `CAP_EVID_*` `CAP_RND_*` `CAP_TOTAL_*` | **8/14** · 5/8 · 9000/13000 | 폴더 개수·총량 상한. **총량은 `evidence/`·`archive/` 를 뺀 "읽는 문서"만 센다** (D71) |
| `check/docs-weight.sh` | `CAP_EVTOT_*` | 6000/12000 | `docs/evidence/**.md` 전용 총량 (2026-08-05 신설 · D71) |
| `check/docs-weight.sh` | `STALE_DAYS` | 30 | 방치 판정. 템플릿은 7일이나 세션 간격이 길어 늘렸다 |
| `check/docs-weight.sh` | `CAP_DECLOG_*` | 1200/없음 | **DECISION-LOG 전용.** 덧붙이기 전용 문서라 줄수는 경고만 — 하드 판정은 목차 대조가 한다 (2026-08-04) |
| `check/docs-weight.sh` | `CAP_FOLDER_MD` | 25 | 폴더별 `AGENTS.md` 상한. 표가 `15`·`CLAUDE.md` 로 낡아 있어 정정 (2026-08-05) |

`make-marker-sheet.py`는 **자기 출력을 픽셀로 검사한다.** quiet zone 안에 검은 잉크가
있거나 캡션이 용지를 넘치면 파일을 만들지 않고 실패한다. 배치표를 바꿀 때 그 검사가 문지기다.

## 훅이 자동으로 부른다

손으로 안 불러도 아래 시점에 돈다. `.claude/settings.json`이 배선이다.

| 시점 | 도는 것 |
|---|---|
| `docs/**.md` 편집 | `check/docs.sh` |
| `.claude/skills/**` · `commands/**` 편집 | `check/harness.sh` |
| `Shared/assets/**` 편집 | `check/assets.sh` |
| `scripts/check/*` · 이 README 편집 | `check/consts.sh` |
| `.env` · `Shared/data/config/*` 편집 | `check/consts.sh` (`.env` ↔ JSON 대조) |
| 개수·기준값이 바뀔 편집 | `check/consts.sh` + `/정합` 알림 |
| **세션 종료** | `check/all.sh` — 레드면 알린다 (`docs-weight.sh` 는 daily 모드로 같이 돈다) |

**실패할 때만 출력한다.** 통과하면 조용하다.

## 문서 무게 — `check/docs-weight.sh`

문서가 쌓여 진입 비용이 오르는 것을 막는다. **재고 판정만 하고 지우거나 옮기지 않는다** —
문서는 SSOT이고, 스크립트가 조용히 옮기면 다음 세션이 못 찾는다.

```bash
bash scripts/check/docs-weight.sh            # daily. 게이트가 매번 부른다 (싸다)
bash scripts/check/docs-weight.sh --weekend  # 중복 md5 · 30일 방치 · 빈 문서 · 이관 후보
```

- **경고(soft)는 exit 0** — 출력만 하고 통과시킨다. 다음 마감 때 처리하면 된다
- **초과(hard)는 exit 1** — 게이트가 막는다
- 무엇이 왜 쌓이는지와 임계값 출처는 `docs/evidence/2026-07-30/doc-weight.md`

**`DECISION-LOG` 만 다르게 잰다.** `docs/INDEX.md` 가 "archive 로 옮기지 않는다" 고
못 박아서 "절을 잘라 이관하라" 는 처방이 적용되지 않는다. 조치 불가능한 경고는 소음이다.
대신 **상단 D번호 목차가 실제 결정 개수와 맞는지**를 잰다 — 안 맞으면 exit 1.
그게 통독을 없애는 장치이고, 이 문서의 진짜 불변식이다.
