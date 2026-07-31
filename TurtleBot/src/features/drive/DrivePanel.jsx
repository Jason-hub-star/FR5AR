// 주행 탭 — 로봇 카드 · 맵 · 슬롯 · 조종권 · 조이스틱 · E-STOP.
// 화면은 datasource 만 안다. 규칙(조종권·전이)은 서버 몫이고 여기는 사유를 보여줄 뿐이다.
import { useEffect, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';
import { MapView } from '../map/MapView.jsx';
import { Teleop } from './Teleop.jsx';
import { LogPanel } from '../logs/LogPanel.jsx';

export function DrivePanel({ who }) {
  const [snap, setSnap] = useState(null);
  const [robot, setRobot] = useState('tb3_1');
  const [slots, setSlots] = useState([]);
  const [maps, setMaps] = useState([]);
  const [pickedSlot, setPickedSlot] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => datasource.subscribeState(setSnap), []);
  useEffect(() => { datasource.getSlots().then(setSlots); datasource.getMaps().then(setMaps); }, []);

  if (!snap) return null;
  const robots = snap.robots;
  const me = robots[robot];

  const act = async (fn) => {
    const res = await fn();
    setNotice(res.ok ? '' : res.reason);
  };

  return (
    <div className="pane drive">
      <div className="robot-cards">
        {Object.entries(robots).map(([id, r]) => (
          <button key={id} type="button" className="robot-card" aria-selected={robot === id}
                  onClick={() => setRobot(id)}>
            <b>{id}</b>
            <span className={`badge ${r.connected ? 'ok' : 'danger'}`}>
              {r.connected ? 'connected' : 'disconnected'}</span>
            <span className="badge">{r.batteryPct ?? '—'}%</span>
            <span className={`badge ${r.mode === 'idle' ? '' : 'info'}`}>{r.mode}</span>
            <span className="dim">pose {r.poseAgeSec}s · {r.activeMap ?? '맵 없음'}</span>
          </button>
        ))}
        <div className="bridge-health dim">
          어댑터 <b>{snap.adapter}</b> · 연결 {Object.values(robots).filter((r) => r.connected).length}
          /{Object.keys(robots).length}
        </div>
      </div>

      <div className="drive-body">
        <MapView geometry={datasource.mapGeometry} robots={robots}
                 paths={Object.values(robots).map((r) => r.trail)}
                 caption={`${me.activeMap ?? '맵 없음'} · 실시간 위치 (활성 맵 원점 기준 mm)`} />

        <aside className="side">
          {/* 비상 버튼은 스크롤 없이 항상 보인다 — 맨 아래 두면 첫 화면 밖으로 밀린다 (실렌더 확인) */}
          <button type="button" className="estop"
                  onClick={() => act(() => datasource.estop(robot))}>
            E-STOP — {robot} 즉시 정지</button>

          <section>
            <h3>맵 슬롯 <span className="dim">nav {me.nav ?? '—'}</span></h3>
            {maps.length === 0
              ? <p className="dim">저장된 맵이 없어요 — 매핑 탭에서 첫 맵을 만들어요</p>
              : <select value={me.activeMap ?? ''}
                        onChange={(e) => e.target.value && act(() => datasource.activateMap(e.target.value, robot))}>
                  <option value="">맵 선택 (AMCL 재기동)</option>
                  {maps.map((m) => <option key={m.name}>{m.name}</option>)}
                </select>}
          </section>

          <section>
            <h3>스크립트 슬롯 <span className="dim">{slots.length}개</span></h3>
            <div className="slot-list">
              {slots.map((s) => (
                <button key={s.name} type="button" className="slot-card"
                        aria-selected={pickedSlot === s.name} onClick={() => setPickedSlot(s.name)}>
                  <b>{s.name}</b><span className="dim">{s.description}</span>
                </button>
              ))}
            </div>
            <div className="row">
              <button type="button" className="primary" disabled={!pickedSlot}
                      onClick={() => act(() => datasource.startSlot(pickedSlot, robot, who))}>
                ▶ 시작</button>
              <button type="button" onClick={() => act(() => datasource.stopRobot(robot))}>■ 정지</button>
              <button type="button" disabled={!me.activeRunId} title="run 에 bagPath 가 기록돼요"
                      onClick={() => act(() => datasource.recordStart(robot))}>● rosbag</button>
            </div>
          </section>

          <section>
            <h3>조종권 <span className="dim">로봇별 독립</span></h3>
            <div className="row">
              <span>소유자 <b>{me.owner ?? '없음'}</b></span>
              {me.owner === who
                ? <button type="button" onClick={() => act(() => datasource.releaseOwner(robot, who))}>반납</button>
                : <button type="button" onClick={() => act(() => datasource.claimOwner(robot, who))}>내가 claim</button>}
            </div>
          </section>

          <section>
            <h3>가상 조이스틱</h3>
            <Teleop robot={robot} who={who} />
          </section>

          {notice && <p className="notice">{notice}</p>}
        </aside>
      </div>

      <LogPanel />
    </div>
  );
}
