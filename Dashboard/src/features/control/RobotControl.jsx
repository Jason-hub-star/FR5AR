// F1·F2·F5 조작·쌍둥이·조종권 — **브리지 서버(`Backend/`)가 있어야 한다.**
// 아직 서버 코드가 0줄이라 L1~L3 보다 뒤다.
//
// 지킬 것:
//   · **여기서 안전을 판단하지 않는다.** 서버가 한다 — 클라이언트를 믿지 않는 것이 규칙이다
//     (SAFETY-RULES.md, fail-closed)
//   · 상태는 WebSocket 한 곳에서 받아 내려준다 (API-CONTRACT.md §상태값)
//   · 조종권이 없으면 화면은 보되 **움직임 명령은 거부된다** (SR_15)
//   · `stop` 은 조종권·상한과 무관하게 항상 통과한다

export function RobotControl() {
  return (
    <section>
      <h2>로봇 조작</h2>
      <p className="todo">미착수 — 브리지 서버(<code>Backend/</code>) 이후. V0~V2.</p>
    </section>
  );
}
