// FR5 조작 엔트리. **탭이면 된다 — 라우터를 넣지 않는다** (TB·Dashboard 규칙 미러).
// 패널 4개 + 상시 안전 바 (FR5-IMPLEMENTATION-PLAN §화면). P1 Live · P2 조종권/jog 까지 산다.
import './main.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { datasource } from '../data/datasource/index.js';
import { LivePanel } from '../features/live/LivePanel.jsx';
import { TeachPanel } from '../features/teach/TeachPanel.jsx';

// **Optimize 는 없다** (D74) — 후보 비교는 PRD 범위 밖이고 생산성 비교의 주인은 관제화면이다.
const PANELS = [
  ['live', 'Live', LivePanel],
  ['teach', 'Teach', TeachPanel],   // 사다리 2 — 지점(점)과 궤적(선)
  ['program', 'Program', null],     // 사다리 3
  ['history', 'History', null],     // 사다리 4
];

const EMPTY = { connected: false, phase: 'DISCONNECTED', enabled: false, mode: 1,
  safety: { emergencyStop: false, collisionDetected: false }, owner: null, robotId: null };

// 상시 안전 바 — 어느 패널에서도 사라지지 않는다 (계획 §화면). STOP 은 항상 여기 있다.
function SafetyBar({ s, who }) {
  // 조종권은 이름이 아니라 토큰이 증명한다 (D55) — 이름만 보면 새로고침 뒤 갇힌다
  const mine = !!who && s.owner === who && datasource.hasOwnerToken();
  const manual = s.mode === 1;
  const items = [
    ['연결', s.connected ? s.robotId : '없음', s.connected ? 'ok' : 'off'],
    ['phase', s.phase,
      s.phase === 'FAIL_CLOSED' ? 'danger'
        : s.phase === 'ARMED' || s.phase === 'EXECUTING' ? 'warn'
          : s.phase === 'OBSERVE_ONLY' || s.phase === 'OWNER_HELD' ? 'ok' : 'off'],
    ['조종권', s.owner ?? '—', s.owner ? 'warn' : 'off'],
    ['서보', s.enabled ? 'ON' : 'OFF', s.enabled ? 'warn' : 'off'],
    // 수동은 경고색이다 — 그 동안 우리 조그·moveJ 가 전부 거부된다
    ['모드', manual ? 'manual' : 'auto', manual ? 'warn' : 'off'],
    ['비상정지', s.safety.emergencyStop ? '작동' : '정상', s.safety.emergencyStop ? 'danger' : 'ok'],
    ['충돌', s.safety.collisionDetected ? '감지' : '정상', s.safety.collisionDetected ? 'danger' : 'ok'],
    ['기록', '—', 'off'],          // P6 에서 산다
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
        <label className="who" data-t="who">이름
          <input value={who} placeholder="조종권에 쓸 이름" onChange={(e) => changeWho(e.target.value)} />
        </label>
        {/* 출처 배지 — 목업을 실기로 오인하는 것이 가장 비싼 사고다 (SR_24) */}
        <span className="source" data-t="source" data-src={state.robotId?.includes('mock') ? 'mock' : state.connected ? 'real' : 'none'}>
          {state.connected ? state.robotId : '미연결'}
        </span>
      </header>
      <SafetyBar s={state} who={who} />
      <nav>
        {PANELS.map(([id, label, Comp]) => (
          <button key={id} type="button" aria-selected={tab === id} disabled={!Comp}
            title={Comp ? undefined : '예정 (골사다리 2~4)'} onClick={() => Comp && setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <main>{(() => {
        const Panel = PANELS.find(([id]) => id === tab)?.[2] ?? LivePanel;
        return <Panel state={state} who={who} />;
      })()}</main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
