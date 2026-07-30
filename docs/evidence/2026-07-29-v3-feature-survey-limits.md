# v3 기능 조사 — 어디까지 확인됐나

분류: 증거 · 2026-07-29

v3(RobotControlV3 / PendantV3) 기능을 조사해 웹 이식 후보를 뽑았다.
**이 조사 결과를 "검증된 기능 목록"으로 취급하면 안 된다.** 아래에 확인 범위를 명시한다.

## 확인된 것 (내가 직접 셌다)

| 항목 | 값 | 방법 |
|---|---|---|
| RuntimeController 파일 | 34개 | `find` |
| DebugBridge 파일 | 11개 | `find` |
| UI 패널(uxml) | 13개 | `ls` |
| UI 컨트롤러(cs) | 48개 | `find` |
| QA 산출물(json) | 4개 | `ls` |
| DebugBridge public 메서드 | 약 200개 | 파일별 grep |
| 인용한 메서드 이름 12개 | 전부 코드에 존재 | 이름 grep |

## 확인되지 않은 것

1. **기능이 실제로 동작하는지 모른다.** 메서드 이름이 있다는 것만 확인했다.
   구현이 비었는지, 예외를 던지는지, 로봇 없이만 도는지는 보지 않았다.
2. **`RobotControlV3.unity` 씬이 빌드 설정에 없다.** 포함된 씬은
   Boot · Onboarding · RobotLibrary · Sandbox · RobotControl(V1) · RobotControlV2 · MathReadiness 이고
   **V3는 빠져 있다.** v3는 배포 경로가 아니라 개발·비교용 가지로 보인다.
3. **실기 로봇에서 검증됐다는 근거를 못 찾았다.** 원본 문서에
   "비-4K GameView 해상도에서 V3 레이아웃 안정화 미완료"가 남아 있다.
4. **기능 설명은 OpenCode 리포트를 옮긴 것이다.** 76행 기능표의 각 설명이
   실제 코드 동작과 맞는지는 대조하지 않았다.
5. **개수 하나가 어긋났다.** OpenCode는 DebugBridge 명령 192개라고 보고했으나
   내 집계로는 파일 9개 중 6개만 일치했다(JointTcp 18 vs 19, LiveControl 35 vs 31, Matrices 24 vs 17).
   무엇을 셌는지도 달랐다 — `case` 문자열이 아니라 public 메서드였다.

## 그래서 이 조사를 어떻게 쓰나

- **후보 목록으로만 쓴다.** "v3에 있으니 웹에도 넣자"가 아니라
  "v3에 이런 이름이 있으니 열어보고 쓸만한지 판단하자"로 읽는다.
- 웹으로 옮기기로 한 기능은 **옮기기 전에 해당 C# 파일을 직접 열어 읽는다.**
  특히 안전 관련(`EvaluateLiveCommandSafety`, 승인 토큰, 세션 모드)은
  조건을 하나씩 확인하지 않고 옮기면 안 된다.
- v3에서 동작을 확인하려면 유니티 에디터에서 `RobotControlV3.unity`를 직접 열어야 한다.
  빌드에 없으므로 앱을 실행해서는 확인할 수 없다.

## 다음에 할 일

`EvaluateLiveCommandSafety`의 실제 조건 목록을 원본에서 읽어 옮긴다.
우리 `server/safety.py`가 이걸 물려받을 예정이라 **가장 먼저 실물 확인이 필요한 항목**이다.
