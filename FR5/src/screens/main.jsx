// FR5 조작 엔트리. **탭이면 된다 — 라우터를 넣지 않는다** (TB·Dashboard 규칙 미러).
// 패널 5개 + 상시 안전 바 (FR5-IMPLEMENTATION-PLAN §화면). P1 은 Live 만 산다.
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

// 상시 안전 바 — 어느 패널에서도 사라지지 않는다 (계획 §화면). P1 은 읽기 전용 표시다.
function SafetyBar({ s }) {
  const items = [
    ['연결', s.connected ? s.robotId : '없음', s.connected ? 'ok' : 'off'],
    ['phase', s.phase, s.phase === 'FAIL_CLOSED' ? 'danger' : s.phase === 'OBSERVE_ONLY' ? 'ok' : 'off'],
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
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('live');
  const [state, setState] = useState(EMPTY);
  useEffect(() => datasource.subscribeState(setState), []);

  return (
    <>
      <header>
        <h1>FR5 조작</h1>
        <span className="sub">FAIRINO FR5 · API-CONTRACT.md</span>
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
      <main><LivePanel state={state} /></main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
