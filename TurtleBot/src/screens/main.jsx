// 터틀봇 관제 엔트리. **탭이면 된다 — 라우터를 넣지 않는다** (Dashboard 규칙 미러).
// 화면은 datasource 만 안다 — mock ↔ http 교체가 파일 한 개다 (TB-CONTRACT.md).
import './main.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { datasource } from '../data/datasource/index.js';
import { DrivePanel } from '../features/drive/DrivePanel.jsx';
import { MappingPanel } from '../features/mapping/MappingPanel.jsx';
import { RunList } from '../features/runs/RunList.jsx';

const TABS = [
  ['drive', '주행', DrivePanel],
  ['mapping', '매핑', MappingPanel],
  ['runs', '기록', RunList],
];

function App() {
  const [tab, setTab] = useState('drive');
  // 조종권 신원 — 브리지의 hello 세션 바인딩에 대응한다 (TB-CONTRACT §명령).
  const [who, setWho] = useState(() => localStorage.getItem('tb-who') ?? '');
  // 출처 배지는 상태의 adapter 필드가 정본 (mock|real) — 정적 값이면 거짓말이 된다 (SR_24)
  const [adapter, setAdapter] = useState(datasource.adapter);
  useEffect(() => datasource.subscribeState((s) => setAdapter(s.adapter)), []);
  const Active = TABS.find(([id]) => id === tab)[2];

  const changeWho = (name) => {
    setWho(name);
    localStorage.setItem('tb-who', name);
  };

  return (
    <>
      <header>
        <h1>터틀봇 관제</h1>
        <span className="sub">TurtleBot3 Burger ×2 · TB-CONTRACT.md</span>
        <label className="who">이름
          <input value={who} placeholder="조종권에 쓸 이름" onChange={(e) => changeWho(e.target.value)} />
        </label>
        {/* 출처 배지 — 목업을 실측으로 오인하는 것이 가장 비싼 사고다 (SR_24) */}
        <span className="source" data-src={adapter}>adapter:{adapter}</span>
      </header>
      <nav>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <main><Active who={who || '게스트'} /></main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);

// 헤드리스 검증용 노출 — Dashboard·AR 과 같은 방식 (evidence/2026-07-30-ar-baseline.md).
Object.assign(window, { TB_TABS: TABS.map(([id]) => id), TB_ADAPTER: datasource.adapter, tbDatasource: datasource });
