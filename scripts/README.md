# scripts — 무엇을 어디에 두나

**루트에 스크립트를 두지 않는다.** 모든 스크립트는 카테고리 폴더 안에 들어간다.
이 README만 루트에 남는다.

## 지금 있는 것

```
scripts/
├── README.md
├── check/                      검증 게이트 — 실패하면 exit 1
│   ├── all.sh                    아래 전부를 순서대로 실행 (진입점)
│   ├── harness.sh                커맨드 8 · 스킬 18 · 훅 2 · settings 연결
│   ├── docs.sh                   필수 문서 · INDEX 등재 · 깨진 링크 · Unity 배너
│   ├── assets.sh                 URDF·메시 존재와 삼각형 수
│   └── consts.sh                 기준값 표 ↔ 실제 상수 대조 (드리프트)
├── build/                      설정·산출물 생성
│   └── config.mjs                .env → web/config/*.json (검증 포함)
├── dev/                        개발 중 사람이 손으로 부른다
│   └── serve.sh                  web/ 로컬 서빙 (기본 8000)
└── assets/                     자산 복사·변환
    ├── sync-from-unity.sh        유니티에서 URDF·메시 가져오기
    ├── make-marker-sheet.py      AR 마커 인쇄 시트 생성 (자가검사 포함)
    └── make-marker-test-images.py  마커 검출 실측용 합성 이미지 117장
```

## 카테고리

| 폴더 | 담당 | 이름 규칙 | 상태 |
|---|---|---|---|
| `check/` | 검증·게이트. 실패 시 **exit 1** | 검사 대상 이름 그대로 | 사용 중 |
| `dev/` | 개발 중 실행. 되돌릴 수 있는 것만 | 동사 | 사용 중 |
| `assets/` | 자산 복사·변환 | 동사 | 사용 중 |
| `build/` | 설정·산출물 생성. **입력이 틀리면 쓰지 않고 멈춘다** | 산출물 이름 | 사용 중 |
| `robot/` | 로봇 연결·모의·브링업 | 동사 또는 대상 | 아직 없음 — 첫 파일 생길 때 만든다 |
| `deploy/` | 배포·터널 | 동사 | 아직 없음 |

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
bash scripts/dev/serve.sh 8080         # web/ 띄우기
bash scripts/assets/sync-from-unity.sh # 유니티 모델 다시 받기
node scripts/build/config.mjs          # .env → web/config/*.json
node scripts/build/config.mjs --check  # 쓰지 않고 대조만 (게이트가 쓴다)
```

## 설정은 `.env` 가 SSOT 다

**브라우저는 환경변수를 읽을 수 없다.** 그래서 `.env` 를 사람이 고치는 유일한 곳으로 두고
`scripts/build/config.mjs` 가 `web/config/*.json` 으로 굽는다. 브라우저는 그 JSON 을 fetch 한다.

- `web/config/*.json` 은 **산출물이다 — 직접 고치지 않는다.** gitignore 대상
- 형식은 `.env.example` (커밋됨). `cp .env.example .env` 로 시작한다
- 셸 환경변수가 `.env` 를 이긴다: `FR5_MARKER_BARCODE=5 node scripts/build/config.mjs`
- **값 검증이 이 스크립트의 본체다.** 바코드가 인쇄물과 다르면 화면에 아무것도 안 뜨고
  콘솔 에러도 없다. 그래서 범위·형식·**원본 존재**까지 보고 틀리면 멈춘다
- 손으로 JSON 을 고치면 `check/consts.sh` 가 드리프트로 잡는다

## 기준값이 있는 곳

숫자를 바꿀 일이 생기면 여기부터 본다. **안 고치면 게이트가 거짓으로 실패한다.**

| 스크립트 | 상수 | 현재값 | 언제 바꾸나 |
|---|---|---|---|
| `check/harness.sh` | `WANT_COMMANDS` `WANT_SKILLS` | 8 / 21 | 하네스를 더 가져오거나 뺄 때 |
| `check/assets.sh` | `WANT_ARM_TRIS` `WANT_GRIP_TRIS` | 58482 / 70102 | 유니티 원본 모델이 바뀔 때 |
| `check/docs.sh` | `REQUIRED` 배열 | 15개 | SSOT 문서를 추가·삭제할 때 |
| `assets/make-marker-sheet.py` | `SHEETS` · `QUIET_RATIO_MIN` | A4 170/14mm · A3 240/20mm · 하한 6% | 마커 크기·용지를 바꿀 때 |
| `build/config.mjs` | `AVAILABLE_BARCODES` | 2 · 3 · 5 | 바코드 원본을 더 받거나 지울 때 |

`make-marker-sheet.py`는 **자기 출력을 픽셀로 검사한다.** quiet zone 안에 검은 잉크가
있거나 캡션이 용지를 넘치면 파일을 만들지 않고 실패한다. 배치표를 바꿀 때 그 검사가 문지기다.

## 훅이 자동으로 부른다

손으로 안 불러도 아래 시점에 돈다. `.claude/settings.json`이 배선이다.

| 시점 | 도는 것 |
|---|---|
| `docs/**.md` 편집 | `check/docs.sh` |
| `.claude/skills/**` · `commands/**` 편집 | `check/harness.sh` |
| `web/assets/**` 편집 | `check/assets.sh` |
| `scripts/check/*` · 이 README 편집 | `check/consts.sh` |
| `.env` · `web/config/*` 편집 | `check/consts.sh` (`.env` ↔ JSON 대조) |
| 개수·기준값이 바뀔 편집 | `check/consts.sh` + `/정합` 알림 |
| **세션 종료** | `check/all.sh` — 레드면 알린다 |

**실패할 때만 출력한다.** 통과하면 조용하다.
