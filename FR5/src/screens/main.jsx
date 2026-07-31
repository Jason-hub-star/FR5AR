// FR5 조작 엔트리. **탭이면 된다 — 라우터를 넣지 않는다** (TB·Dashboard 규칙 미러).
// 패널 5개 + 상시 안전 바 (FR5-IMPLEMENTATION-PLAN §화면). P1 Live · P2 조종권/jog 까지 산다.
import './main.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { datasource } from '../data/datasource/index.js';
import { LivePanel } from '../features/live/LivePanel.jsx';

const PANELS = [
  ['live', 'Live', LivePanel],
  ['teach', 'Teach', null],       // P3
  ['program', 'Program', null],   // P4
  ['optimize', 'Optimize', null], // P5
  ['history', 'History', null],   // P6
];

const EMPTY = { connected: false, phase: 'DISCONNECTED', enabled: false, mode: 1,
  safety: { emergencyStop: false, collisionDetected: false }, owner: null, robotId: null };

// 상시 안전 바 — 어느 패널에서도 사라지지 않는다 (계획 §화면). STOP 은 항상 여기 있다.
function SafetyBar({ s }) {
  const items = [
    ['연결', s.connected ? s.robotId : '없음', s.connected ? 'ok' : 'off'],
    ['phase', s.phase,
      s.phase === 'FAIL_CLOSED' ? 'danger'
        : s.phase === 'ARMED' || s.phase === 'EXECUTING' ? 'warn'
          : s.phase === 'OBSERVE_ONLY' || s.phase === 'OWNER_HELD' ? 'ok' : 'off'],
    ['조종권', s.owner ?? '—', s.owner ? 'warn' : 'off'],
    ['서보', s.enabled ? 'ON' : 'OFF', s.enabled ? 'warn' : 'off'],
    ['모드', s.mode === 0 ? 'auto' : 'manual', 'off'],
    ['비상정지', s.safety.emergencyStop ? '작동' : '정상', s.safety.emergencyStop ? 'danger' : 'ok'],
    ['충돌', s.safety.collisionDetected ? '감지' : '정상', s.safety.collisionDetected ? 'danger' : 'ok'],
    ['기록', '—', 'off'],          // P6 에서 산다
  ];
  return (
    <div className="safetybar">
      {items.map(([label, value, tone]) => (
        <span key={label} className="safeitem" data-tone={tone}>
          <b>{label}</b> {value}
        </span>
      ))}
      {/* 제3원칙 — stop 은 항상 통과한다. 어느 화면에서든 한 번에 누른다 */}
      <button type="button" className="estop" onClick={() => datasource.stop()}>STOP</button>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('live');
  const [state, setState] = useState(EMPTY);
  // 조종권 신원 — 브리지의 hello 세션 바인딩에 대응한다 (API-CONTRACT §명령)
  const [who, setWho] = useState(() => localStorage.getItem('fr5-who') ?? '');
  useEffect(() => datasource.subscribeState(setState), []);
  useEffect(() => { datasource.setWho(who); }, [who]);

  const changeWho = (name) => {
    setWho(name);
    localStorage.setItem('fr5-who', name);
  };

  return (
    <>
      <header>
        <h1>FR5 조작</h1>
        <span className="sub">FAIRINO FR5 · API-CONTRACT.md</span>
        <label className="who">이름
          <input value={who} placeholder="조종권에 쓸 이름" onChange={(e) => changeWho(e.target.value)} />
        </label>
        {/* 출처 배지 — 목업을 실기로 오인하는 것이 가장 비싼 사고다 (SR_24) */}
        <span className="source" data-src={state.robotId?.includes('mock') ? 'mock' : state.connected ? 'real' : 'none'}>
          {state.connected ? state.robotId : '미연결'}
        </span>
      </header>
      <SafetyBar s={state} />
      <nav>
        {PANELS.map(([id, label, Comp]) => (
          <button key={id} type="button" aria-selected={tab === id} disabled={!Comp}
            title={Comp ? undefined : '예정 (P3~P6)'} onClick={() => Comp && setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <main><LivePanel state={state} who={who} /></main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
