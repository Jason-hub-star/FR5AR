# TB 관제 UI 레퍼런스 목업 — Codex 생성 · 실렌더 캡처 3장

일시: 2026-07-31 · 단계: P0.7 시각 게이트 (코드 착수 전) · 상태: **승인 (2026-07-31)**

Codex CLI(gpt 계열)가 `TB-CONTRACT.md`(감사 반영판)와 `Dashboard/src/screens/main.css`
(디자인 토큰)를 읽고 정적 HTML 3장을 생성 → Chrome 헤드리스 1280×900 캡처.
목업 HTML 원본은 스크래치패드(세션 소멸) — **레퍼런스는 이 이미지 3장이 정본**이다.
P1 은 이 화면을 시각 기준으로 새로 짠다 (목업 코드는 재사용하지 않는다).

| 파일 | 화면 | 확인된 것 |
|---|---|---|
| `2026-07-31-tb-ui-drive.png` | 주행 탭 | 로봇 2대 카드(connected·battery·mode) · 맵+실주행/계획 경로 · 슬롯 3종 시작/정지 · 조종권 · 조이스틱(워치독 500ms 표기) · E-STOP · 로그 패널(source 4색·필터 칩) · adapter:mock 배지 |
| `2026-07-31-tb-ui-mapping.png` | 매핑 탭 | mode=mapping 배지 · 안개/확정영역 라이브 맵 · 이름 규칙 안내 포함 저장 · 저장 없이 중단 · 상한 150mm/s·60°/s 표기 |
| `2026-07-31-tb-ui-runs.png` | 기록 탭 | result 4색 배지 · bag 표시 · 필터 · 상세(경로 미니맵·travelMm·metrics JSON·note 편집·PATCH 표기) |

계약 정합: 화면의 수치·규칙(워치독 500ms · 상한 · tick 100ms · 이름 규칙 · source 어휘 ·
result 4값)이 전부 TB-CONTRACT 값과 일치함을 캡처에서 확인했다.

## 판정

- [x] 3장 실렌더 됨 (Chrome 헤드리스)
- [x] 주인님 방향 승인 (2026-07-31) → P1 착수
