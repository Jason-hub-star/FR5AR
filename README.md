# FR5AR — 폰으로 로봇을 실물 위에 겹쳐 보기

FAIRINO FR5 협동로봇을 **브라우저에서 팀 전체가 함께 다루는** 웹 작업대.
앱 설치 없이 폰 카메라로 실물 위에 예정 경로와 안전 범위를 겹쳐 본다.

## 지금 바로 보기

**https://web-nine-rho-89.vercel.app**

로그인 없이 열린다. **겹쳐 보기 (AR)** → **시작** → 카메라 허용 → 마커를 비추고 **2~3초 기다린다**.

> 바로 안 뜨는 것이 정상이다. 검출기가 첫 인식까지 수십 프레임을 먹는다.

### 마커 인쇄

`web/assets/marker/marker-print-A4-170mm-bc2.png` — **A4에 100% 배율**로 뽑는다.

| 지켜야 할 것 | 왜 |
|---|---|
| **100% 배율.** "용지에 맞춤"·"축소" 끄기 | 크기가 틀리면 로봇 크기가 틀린다 |
| **무광 용지** | 광택지 반사광이면 크기와 무관하게 안 잡힌다 |
| **딱딱한 판에 평평하게** | 휘면 사각형 검출이 깨진다 |
| **인쇄 후 자로 검은 사각형을 잰다** | 프린터가 축소한다. 실측 143mm 였다 (목표 170의 84%) |

잰 값은 화면 **⚙** 또는 `.env` 의 `FR5_MARKER_MM` 에 넣는다.

## 화면 3개

| 주소 | 하는 일 |
|---|---|
| `/ar.html` | **겹쳐 보기.** 상자 / 로봇 / 궤적 / 안전 범위 · ⚙ 조정판 · 진단 수치 |
| `/robot.html` | 카메라 없이 3D 로봇만. 그리퍼 장착값 맞추는 화면 |
| `/test/marker-detect.html` | 합성 이미지로 실제 검출기를 재는 검증 페이지 |

**안 될 때는 `docs/ref/AR-DEBUG.md`** — 증상별 원인표와 진단 수치 읽는 법이 있다.

## 로컬에서 돌리기

```bash
cp .env.example .env               # 설정. .env 는 커밋하지 않는다
node scripts/build/config.mjs      # .env → web/config/*.json 생성 (필수)
bash scripts/dev/serve.sh 8123     # http://localhost:8123
```

> **`web/config/*.json` 은 생성물이다.** 직접 고치지 말고 `.env` 를 고친 뒤 다시 생성한다.
> 카메라는 HTTPS 에서만 열리므로 **폰 테스트는 배포본으로** 한다 (로컬 IP 로는 안 된다).

검증 페이지용 합성 이미지가 필요하면:
```bash
python3 scripts/assets/make-marker-test-images.py
```

## 검증

```bash
bash scripts/check/all.sh          # 게이트 전부. 하나라도 실패하면 exit 1
```

문서·자산·하네스·기준값 네 게이트가 돈다. **숫자가 문서와 어긋나면 실패한다** —
삼각형 수, 문서 등재 수, `.env` ↔ 생성된 JSON 등.

## 배포

```bash
cd web && vercel --prod --yes --scope kimjuyoung1127s-projects
```

공유 주소는 위의 **공개 별칭**을 쓴다. `vercel` 이 찍어주는
`web-<해시>-...` 주소는 팀 계정 로그인을 요구해 팀원이 못 연다.

## 무엇이 확인됐고 무엇이 안 됐나

| 확인됨 | 근거 |
|---|---|
| URDF + 그리퍼 웹 렌더 (128,584 삼각형) | `docs/evidence/2026-07-29-urdf-web-render.md` |
| 그리퍼 장착값 — 플랜지 간격 0.00mm | `docs/evidence/2026-07-30-gripper-mount.md` |
| 마커 검출 — **크기보다 대비가 결정한다** | `docs/evidence/2026-07-30-marker-detect.md` |
| 폰에서 로봇이 겹쳐 보임 · 깜빡임 억제 '강' 안정 | 2026-07-30 실기 |

| 아직 안 됨 |
|---|
| 정합 오차 실측 (±5~15mm 는 **문헌값**) |
| 실물 로봇 옆에 겹쳐 보기 |
| 브리지 서버 (`server/` 없음) — 로봇 실시간 상태 |
| 터틀봇 연계 — 요구정의서에 아직 없다 |

## 문서

`docs/INDEX.md` 가 지도다. 처음이면 이 순서로 본다.

1. `docs/SESSION-START.md` — 세션 캡슐
2. `docs/status/PROJECT-STATUS.md` — 지금 어디까지
3. `docs/status/DECISION-LOG.md` — 왜 그렇게 정했나 (D1~D13)
4. `docs/ref/AR-DEBUG.md` — AR 이 안 될 때

## 기술

AR.js 3.4.8 (마커 방식 — **iOS 는 WebXR 을 안 열어준다**) · three.js 0.185.1 ·
urdf-loader 0.13.1 · 빌드 단계 없는 정적 사이트 (importmap)
