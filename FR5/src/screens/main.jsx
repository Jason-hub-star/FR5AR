// FR5 조작 엔트리. **탭이면 된다 — 라우터를 넣지 않는다** (TB·Dashboard 규칙 미러).
// 패널 4개 + 상시 안전 바 (FR5-IMPLEMENTATION-PLAN §화면). P1 Live · P2 조종권/jog 까지 산다.
//
// **3D 와 조작대는 여기 산다** (계획 §레이아웃 · 2026-08-03 확정). 탭은 오른쪽 패널만
// 갈아치운다 — 쌍둥이를 패널마다 두면 탭을 옮길 때 재마운트돼 카메라 각도가 리셋되고,
// 조작대가 Live 안에 있으면 Teach 에서 자세를 만들 때마다 탭을 왕복하게 된다.
import './main.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { datasource } from '../data/datasource/index.js';
import { ControlDock } from '../features/control/ControlDock.jsx';
import { RobotTwin } from '../features/live/RobotTwin.jsx';
import { CamView } from '../features/live/CamView.jsx';
import { LivePanel } from '../features/live/LivePanel.jsx';
import { ProgramPanel } from '../features/program/ProgramPanel.jsx';
import { TeachPanel } from '../features/teach/TeachPanel.jsx';

// **Optimize 는 없다** (D74) — 후보 비교는 PRD 범위 밖이고 생산성 비교의 주인은 관제화면이다.
const PANELS = [
  ['live', 'Live', LivePanel],
  ['teach', 'Teach', TeachPanel],   // 사다리 2 — 지점(점)과 궤적(선)
  ['program', 'Program', ProgramPanel],   // 사다리 3 — 순서로 엮어 승인·한 단계씩
  ['history', 'History', null],     // 사다리 4
];

const EMPTY = { connected: false, phase: 'DISCONNECTED', enabled: false, mode: 1,
  safety: { emergencyStop: false, collisionDetected: false }, owner: null, robotId: null };

// phase 는 영문 그대로 두고 **한글을 덧붙인다** (감사 2026-08-06 P1). 지우면 처음 보는
// 사람이 `OBSERVE_ONLY` 를 못 읽고, 실렌더 게이트도 이 enum 을 본다 — 둘 다 살린다.
const PHASE_KO = {
  DISCONNECTED: '연결 안 됨', PREFLIGHT: '점검 중', OBSERVE_ONLY: '보기만 함',
  OWNER_HELD: '조종권 잡힘', ARMED: '움직일 수 있음', EXECUTING: '실행 중',
  FAIL_CLOSED: '막혔음',
};

// 상시 안전 바 — 어느 패널에서도 사라지지 않는다 (계획 §화면). STOP 은 항상 여기 있다.
function SafetyBar({ s, who }) {
  // 조종권은 이름이 아니라 토큰이 증명한다 (D55) — 이름만 보면 새로고침 뒤 갇힌다
  const mine = !!who && s.owner === who && datasource.hasOwnerToken();
  const manual = s.mode === 1;
  const items = [
    ['연결', s.connected ? s.robotId : '없음', s.connected ? 'ok' : 'off'],
    ['단계', `${s.phase} ${PHASE_KO[s.phase] ?? ''}`.trim(),
      s.phase === 'FAIL_CLOSED' ? 'danger'
        : s.phase === 'ARMED' || s.phase === 'EXECUTING' ? 'warn'
          : s.phase === 'OBSERVE_ONLY' || s.phase === 'OWNER_HELD' ? 'ok' : 'off'],
    ['조종권', s.owner ?? '아무도 안 잡음', s.owner ? 'warn' : 'off'],
    ['서보', s.enabled ? 'ON 켜짐' : 'OFF 꺼짐', s.enabled ? 'warn' : 'off'],
    // 수동은 경고색이다 — 그 동안 우리 조그·moveJ 가 전부 거부된다
    ['모드', manual ? 'manual 수동(펜던트)' : 'auto 자동(웹)', manual ? 'warn' : 'off'],
    ['비상정지', s.safety.emergencyStop ? '작동' : '정상', s.safety.emergencyStop ? 'danger' : 'ok'],
    ['충돌', s.safety.collisionDetected ? '감지' : '정상', s.safety.collisionDetected ? 'danger' : 'ok'],
    // 계획 §화면이 기록을 바 항목으로 지정했다 — 칸은 지키되 `—` 대신 **사실을 적는다**
    // (감사 2026-08-06 P2). 영구 대시는 자리만 먹고 아무 말도 안 했다. History(사다리 4)가
    // 살면 여기가 「기록 중」 을 말한다.
    ['기록', '안 함', 'off'],
  ];
  return (
    <div className="safetybar" data-t="safetybar">
      {items.map(([label, value, tone]) => (
        <span key={label} className="safeitem" data-t="safeitem" data-tone={tone}>
          <b>{label}</b> {value}
        </span>
      ))}
      {/* ARM 이 SetMode(0) 을 부르므로 한 번 ARM 하면 펜던트가 잠긴다 (D72).
          드래그 티칭은 서보가 켜져 있어야 되므로 ARMED 에서도 넘길 수 있어야 한다 */}
      <button type="button" className="modetoggle" data-t="mode-toggle" disabled={!mine}
        title={mine ? '' : '조종권을 잡아야 바꿀 수 있다'}
        onClick={() => datasource.setMode(!manual)}>
        {manual ? '자동으로' : '수동으로'}
      </button>
      {/* 제3원칙 — stop 은 항상 통과한다. 어느 화면에서든 한 번에 누른다 */}
      <button type="button" className="estop" data-t="estop" onClick={() => datasource.stop()}>STOP</button>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('live');
  const [state, setState] = useState(EMPTY);
  // 3D 가 무엇을 그리나. null 이면 실물이고, 패널이 채우면 미리보기·되감기다.
  // **실물이 아닐 때는 화면이 그렇게 말한다** — 미리보기를 실물로 오인하면 위치를 오판한다.
  const [view, setView] = useState(null);
  // 조종권 신원 — 브리지의 hello 세션 바인딩에 대응한다 (API-CONTRACT §명령)
  const [who, setWho] = useState(() => localStorage.getItem('fr5-who') ?? '');
  useEffect(() => datasource.subscribeState(setState), []);
  useEffect(() => { datasource.setWho(who); }, [who]);
  // 검증용 읽기 훅 (TB 의 `window.TB_TABS` 와 같은 규약). 관절 표는 Live 패널에만 있어서
  // 다른 탭에 선 채로는 값을 볼 데가 없다 — 실렌더 검증이 여기서 읽는다. **쓰기는 없다.**
  useEffect(() => { window.FR5_STATE = state; }, [state]);

  const changeWho = (name) => {
    setWho(name);
    localStorage.setItem('fr5-who', name);
  };

  return (
    <>
      <header>
        <h1>FR5 조작</h1>
        <span className="sub">FAIRINO FR5 · API-CONTRACT.md</span>
        {/* 이름이 첫 관문이다 — 비어 있으면 그 뒤 전부가 막힌다. 그 사실이 툴팁에만 있어서
            처음 온 사람이 헤더 구석을 못 찾았다 (감사 2026-08-06 P1). 이제 칸이 스스로 말한다 */}
        <label className="who" data-t="who" data-need={String(!who.trim())}>이름
          <input value={who} placeholder="여기에 이름부터" onChange={(e) => changeWho(e.target.value)} />
        </label>
        {/* 출처 배지 — 목업을 실기로 오인하는 것이 가장 비싼 사고다 (SR_24) */}
        <span className="source" data-t="source" data-src={state.robotId?.includes('mock') ? 'mock' : state.connected ? 'real' : 'none'}>
          {state.connected ? state.robotId : '미연결'}
        </span>
      </header>
      <SafetyBar s={state} who={who} />
      <main className="workspace">
        {/* 3D 는 고정이다 — 탭이 바뀌어도 재마운트되지 않아 카메라 각도가 유지된다 */}
        <section className="stage">
          <RobotTwin jointsDeg={view?.jointsDeg ?? state.jointsDeg ?? [0, 0, 0, 0, 0, 0]}
            gripperPct={view?.gripperPct ?? state.gripper?.pct ?? null} />
          {/* 실영상도 3D 와 같이 탭 밖이다 — 패널 안이면 탭마다 스트림이 끊긴다 */}
          <CamView />
          <p className="twinnote" data-t="twin-note" data-live={String(!view)}>
            {view?.label ?? '실물 자세'}
          </p>
        </section>
        <aside className="side">
          <nav>
            {PANELS.map(([id, label, Comp]) => (
              <button key={id} type="button" aria-selected={tab === id} disabled={!Comp}
                title={Comp ? undefined : '아직 안 만들었습니다 (골사다리 4)'}
                onClick={() => Comp && setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          <div className="panelbox">{(() => {
            const Panel = PANELS.find(([id]) => id === tab)?.[2] ?? LivePanel;
            return <Panel state={state} who={who} onView={setView} />;
          })()}</div>
          {/* 조작대는 어느 탭에서도 자리를 지킨다 (계획 §레이아웃) */}
          <ControlDock state={state} who={who} />
        </aside>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
