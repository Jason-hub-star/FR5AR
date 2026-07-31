// D36 경계 자리표시자 — FR5 조작·안전·조종권은 `FR5/`가 소유한다.
// Dashboard는 이후 읽기 전용 상태 요약과 FR5 앱 연결만 제공한다.

export function RobotControl() {
  return (
    <section>
      <h2>FR5 상태</h2>
      <p className="todo">FR5 웹 조작 화면은 별도 <code>FR5/</code> 구조로 준비됐습니다.</p>
    </section>
  );
}
