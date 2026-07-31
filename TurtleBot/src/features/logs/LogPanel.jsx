// 라이브 로그 패널 — 주행·매핑 탭 하단 상주. source 별 색 + 필터 칩 (TB-CONTRACT §로그).
import { useEffect, useRef, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';

const SOURCES = ['전체', 'slot', 'nav', 'rosout', 'bridge'];

export function LogPanel() {
  const [lines, setLines] = useState([]);
  const [filter, setFilter] = useState('전체');
  const bodyRef = useRef(null);

  useEffect(() => datasource.subscribeLogs((entry) =>
    setLines((prev) => [...prev.slice(-499), entry])), []);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;   // 자동 스크롤
  }, [lines, filter]);

  const shown = filter === '전체' ? lines : lines.filter((l) => l.source === filter);

  return (
    <section className="logpanel">
      <div className="logpanel-head">
        <h3>라이브 로그</h3>
        {SOURCES.map((s) => (
          <button key={s} type="button" className="chip" aria-selected={filter === s}
                  onClick={() => setFilter(s)}>{s}</button>
        ))}
        <span className="logpanel-note">최근 500줄 · 자동 스크롤</span>
      </div>
      <div className="logpanel-body" ref={bodyRef}>
        {shown.map((l, i) => (
          <div key={i} className="logline">
            <span className="log-t">{new Date(l.t * 1000).toLocaleTimeString('ko-KR', { hour12: false })}</span>
            <span className="log-robot">{l.robot}</span>
            <span className={`log-src src-${l.source}`}>{l.source}</span>
            <span className={l.level === 'warn' ? 'log-warn' : ''}>{l.line}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
