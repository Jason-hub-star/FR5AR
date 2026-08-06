// 조그·그리퍼 상시 조작대 (FR5-IMPLEMENTATION-PLAN §레이아웃 · 2026-08-03 확정).
//
// **Live 패널의 소유물이 아니다.** Teach 는 로봇을 조그하며 쓰는 화면이라, 조작대가 Live 에만
// 있으면 "자세를 만든다 → 캡처한다" 사이에 탭이 두 번 바뀐다. 특히 그리퍼는 캡처가 굳히는
// 값(`gripperPct`)이라, 파지 자세 하나를 가르치려면 매번 Live 로 건너갔다 돌아와야 했다
// (2026-08-06 실기 지적).
//
// 안전 판정은 전부 서버가 한다. 여기 disabled 는 편의지 안전장치가 아니다
// (SAFETY-RULES 제2원칙). 조그·그리퍼 둘 다 서버가 조종권 + ARMED 를 다시 본다.
import { useEffect, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';

const JOINT_LABELS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];
const JOG_STEP_DEG = 1.0;

// 그리퍼는 관절이 아니다. 보내는 값과 읽는 값이 **같은 척도**다 (2026-08-04 실기 확인).
// 그래서 숫자를 하나만 보여준다. 반대라고 적혀 있던 8/3 기록은 수동 모드 관측이었다.
function Gripper({ gripper, busy }) {
  const [pct, setPct] = useState(50);
  const g = gripper ?? {};
  const active = g.active === true;
  return (
    <div className="gripper" data-t="gripper">
      <h3>그리퍼</h3>
      {g.fault && (
        <p className="refusal" data-t="gripper-fault">
          그리퍼가 고장 신호를 냈다. 명령이 거부된다.
        </p>
      )}
      {!active && (
        <button type="button" data-t="gripper-activate" disabled={busy}
          onClick={() => datasource.gripperActivate()}>
          그리퍼 활성화
        </button>
      )}
      {!active && <p className="hint">활성화하면 손가락이 움직인다.</p>}
      <label>보낼 값 {pct}% <span className="mm">(벌어짐 약 {(pct * 0.4).toFixed(1)}mm)</span>
        <input type="range" min="0" max="100" step="1" value={pct} data-t="gripper-range"
          disabled={!active || busy} onChange={(e) => setPct(Number(e.target.value))} />
      </label>
      <div className="griprow">
        <button type="button" data-t="gripper-open" disabled={!active || busy}
          onClick={() => datasource.gripper(100)}>완전 열기</button>
        <button type="button" data-t="gripper-send" disabled={!active || busy}
          onClick={() => datasource.gripper(pct)}>{pct}% 로</button>
        <button type="button" data-t="gripper-close" disabled={!active || busy}
          onClick={() => datasource.gripper(0)}>완전 닫기</button>
      </div>
      <dl>
        <dt>지금 벌어짐</dt><dd data-t="gripper-raw">{g.pct == null ? '—' : `${g.pct}%`}</dd>
        <dt>상태</dt><dd>{g.motionDone === undefined ? '—' : g.motionDone ? '멈춤' : '움직이는 중'}</dd>
      </dl>
    </div>
  );
}

export function ControlDock({ state, who }) {
  const [refusal, setRefusal] = useState(null);
  useEffect(() => datasource.subscribeRefusals(setRefusal), []);

  const mine = !!who && state.owner === who && datasource.hasOwnerToken();
  const armed = state.phase === 'ARMED' || state.phase === 'EXECUTING';

  // **왜 조종권·ARM 전에도 자리를 지키나** — 없어졌다 나타나면 사람이 "어느 탭이었지" 를
  // 다시 찾는다. 자리는 그대로 두고 지금 무엇이 모자란지 한 줄로 말한다.
  if (!mine || !armed) {
    return (
      <section className="dock dock-off" data-t="dock">
        <h3>조작대</h3>
        <p className="hint" data-t="dock-locked">
          {!state.connected ? '로봇에 연결하면 열린다.'
            : !mine ? '조종권을 잡으면 열린다.'
              : 'ARM 하면 열린다.'}
        </p>
      </section>
    );
  }

  return (
    <section className="dock" data-t="dock">
      <h3>조작대</h3>
      <div className="jog">
        {JOINT_LABELS.map((name, i) => (
          <div key={name} className="jogrow" data-t="jogrow">
            <span>{name}</span>
            <button type="button" onClick={() => datasource.jog(i, -JOG_STEP_DEG)}>−{JOG_STEP_DEG}°</button>
            <button type="button" onClick={() => datasource.jog(i, +JOG_STEP_DEG)}>+{JOG_STEP_DEG}°</button>
          </div>
        ))}
        <p className="hint">서버 상한은 속도 10%, 관절 5°/회다. 넘으면 거부된다.</p>
      </div>
      <Gripper gripper={state.gripper} busy={false} />
      {refusal && (
        <p className="refusal" data-t="dock-refusal"><b>거부됨</b> {refusal}</p>
      )}
    </section>
  );
}
