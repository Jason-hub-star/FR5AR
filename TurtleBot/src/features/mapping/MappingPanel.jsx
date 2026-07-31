// 매핑 탭 — SLAM 시작 · 수동 탐색(조이스틱) · 이름 붙여 저장.
// 매핑은 명시적 save/stop 까지 유지된다 (TB-CONTRACT §맵) — 그 규칙을 화면에도 적는다.
import { useEffect, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';
import { MapView } from '../map/MapView.jsx';
import { Teleop } from '../drive/Teleop.jsx';
import { LogPanel } from '../logs/LogPanel.jsx';

export function MappingPanel({ who }) {
  const [snap, setSnap] = useState(null);
  const [robot, setRobot] = useState('tb3_1');
  const [mapName, setMapName] = useState('');
  const [notice, setNotice] = useState('');
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => datasource.subscribeState(setSnap), []);
  // live.png 1초 폴링 (TB-CONTRACT §맵) — 캐시를 tick 쿼리로 깬다
  useEffect(() => {
    const t = setInterval(() => setLiveTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!snap) return null;
  const me = snap.robots[robot];
  const mapping = me.mode === 'mapping';
  const liveUrl = datasource.liveMapUrl(robot);

  const act = async (fn) => { const res = await fn(); setNotice(res.ok ? '' : res.reason); };

  return (
    <div className="pane mapping">
      <div className="robot-cards">
        {Object.keys(snap.robots).map((id) => (
          <button key={id} type="button" className="robot-card" aria-selected={robot === id}
                  onClick={() => setRobot(id)}>
            <b>{id}</b>
            {snap.robots[id].mode === 'mapping' && <span className="badge warn">mode=mapping</span>}
            <span className="dim">nav {snap.robots[id].nav ?? '—'}</span>
          </button>
        ))}
      </div>

      <div className="drive-body">
        {mapping && liveUrl ? (
          <div className="mapview">
            <p className="mapview-caption">새 지도 작성 중 — live.png · 1초 갱신 · 50mm/px</p>
            <img className="livemap" alt="작성 중인 점유격자"
                 src={`${liveUrl}&t=${liveTick}`} width="960" height="640" />
          </div>
        ) : (
          <MapView geometry={datasource.mapGeometry} robots={{ [robot]: me }}
                   paths={[me.trail ?? []]}
                   caption={mapping ? '새 지도 작성 중 (mock 벡터)' : '매핑을 시작하면 여기 지도가 그려져요'} />
        )}

        <aside className="side">
          <section>
            <h3>매핑 세션</h3>
            {mapping && <p className="notice warn">매핑 진행 중 — 저장 또는 중단 전까지 SLAM이 계속 돌아요</p>}
            <div className="row">
              <button type="button" className="primary" disabled={mapping}
                      onClick={() => act(() => datasource.startMapping(robot, who))}>▶ 매핑 시작</button>
              <button type="button" disabled={!mapping}
                      onClick={() => act(() => datasource.stopMapping(robot))}>■ 저장 없이 중단</button>
            </div>
          </section>

          <section>
            <h3>지도 저장</h3>
            <p className="dim">이름은 영문 소문자·숫자·하이픈만 — 파일 이름이 돼요</p>
            <input value={mapName} placeholder="lab-east-0801"
                   onChange={(e) => setMapName(e.target.value)} />
            <button type="button" className="primary" disabled={!mapping || !mapName}
                    onClick={() => act(() => datasource.saveMap(robot, mapName))}>현재 지도를 저장</button>
          </section>

          <section>
            <h3>수동 탐색 조이스틱</h3>
            <Teleop robot={robot} who={who} />
          </section>

          {notice && <p className="notice">{notice}</p>}
        </aside>
      </div>

      <LogPanel />
    </div>
  );
}
