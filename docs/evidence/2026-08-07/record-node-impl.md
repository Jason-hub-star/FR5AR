# 기록 노드 착수 — 계약에서 실기 왕복까지 (Database/)

날짜 2026-08-07 · 계약 `RECORD-NODE-CONTRACT.md` · 페이즈루프 4/4 · 표준 라이브러리만

## 무엇을 세웠나

D81 의 "랩 안 SQLite" 를 코드로 옮겼다. 4 페이즈, 파일 8개, 새 의존성 0.

| Phase | 산출 | 검증 (실제로 실행) |
|---|---|---|
| 1 스키마 | `Database/schema.sql`·`migrate.py` | 10 테이블 로드 · 생성컬럼 `comparable` · 재적용 idempotent |
| 2 보존 게이트 | `Database/retention.py`·`test_retention.py` | **12/12** · phase·safety·connected 전이는 유휴여도 항상 저장 |
| 3 수집기 | `Database/collector.py` | **실기 브리지 238 프레임 → 저장 1·건너뜀 237(99% skip)** · 오프라인 합성 저장4/건너뜀99 |
| 4 게이트 | `scripts/check/db-unit.sh` | EXIT=0 · **보존 로직 일부러 깨서 `FAILED(3)` 빨간불 확인** (D85 규율) |

## 어떻게 확인했나

- 실기 — `python3 collector.py … ws://192.168.30.240:5055/ws/state --seconds 8`.
  로봇이 지금 OBSERVE_ONLY·서보 OFF(유휴)라 보존 게이트가 유휴 프레임 237/238 을 실제로 건너뛰었다.
  robot(`fr5-lab-a`·arm) upsert · session 1 · state_sample 1 · raw_json 17 키 정상.
- 단위 — `python3 -m unittest test_retention` 12/12. ε 양쪽 경계·AMR pose·전이 불변식 포함.
- 게이트 빨간불 — `retention.py` 의 idle-skip 을 항상저장으로 뒤집으니 `db-unit.sh` EXIT=1.
  pipefail 이 `| tail` 너머로 실패를 전파함도 별도 확인.

## 설계 요점 (계약 §확장성·§보존)

- **raw_json 원본 보존** — 새 SDK/계약 필드가 마이그레이션 없이 산다.
- **보존 = 움직일 때만 + 전이 항상 + 14일 창.** 유휴 상주 노드의 저장이 0 에 수렴 (811MB/일 → 활성 300–400MB).
- **읽기 전용 구독** — 명령을 안 보낸다(ws:// assert · GET 업그레이드만). 쓰는 주체는 이 프로세스 하나.

## 확인하지 않은 것 (다음 세션)

- **서빙 읽기 API** `GET /records/*` — 아직 0줄. 팀이 랩 안에서 읽는 경로.
- **14일 자동 정리** — 정책은 계약에 있으나 프루너 미구현.
- **Pi5 배포** — 맥에서 실기 브리지로 검증했다. 파이5 상주 서비스 등록(systemd)·NVMe/SSD 는 미착수.
- **ARMED-정지 히트비트** — 서보 ON·무동작 장구간이면 27Hz 로 쌓인다 (ceiling · 계약 §보존).
