// Live 패널 — 연결 진단 · 조종권/ARM · 6축/TCP 현재값 (FR5-IMPLEMENTATION-PLAN §화면 1).
//
// **3D 와 조작대(조그·그리퍼)는 여기 없다.** 둘 다 어느 탭에서도 살아 있어야 해서
// `main.jsx` 가 들고 있다 (계획 §레이아웃). 이 패널은 "로봇에 붙고 권한을 잡는" 일만 한다.
//
// 슬롯 편집·장기 그래프는 여기 넣지 않는다. 안전 판정은 전부 서버가 한다 —
// 이 화면의 disabled 는 편의지 안전장치가 아니다 (SAFETY-RULES 제2원칙).
import { useEffect, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';

const JOINT_LABELS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];
const TCP_LABELS = ['x mm', 'y mm', 'z mm', 'rx °', 'ry °', 'rz °'];

export function LivePanel({ state, who }) {
  const [robots, setRobots] = useState([]);
  const [picked, setPicked] = useState('');
  const [version, setVersion] = useState(null);
  const [lastRefusal, setLastRefusal] = useState(null);   // fail-closed 사유는 사람이 읽는다 (D40)
  const [busy, setBusy] = useState(false);
  const [siteConfirmed, setSiteConfirmed] = useState(false);

  useEffect(() => {
    datasource.getRobots().then((list) => {
      setRobots(list);
      setPicked((p) => p || list[0]?.robotId || '');
    });
  }, []);
  useEffect(() => datasource.subscribeRefusals(setLastRefusal), []);
  useEffect(() => {
    if (state.connected) datasource.getVersion().then((v) => v.ok !== false && setVersion(v));
    else setVersion(null);
  }, [state.connected]);

  // **`try/finally` 가 없어서 영구히 잠겼다** (감사 2026-08-06 P0). 브리지가 못 답하면
  // `fetch` 가 거절하고 `setBusy(false)` 가 영영 안 돌아 연결·조종권·ARM·DISARM 버튼이
  // 전부 죽은 채로 남았다 — 새로고침 말고는 나갈 길이 없었다. Teach·Program 은 이미
  // 이 모양이었고 Live 만 남아 있었다. 그리고 **못 닿은 것도 사람에게 말한다** (제1원칙).
  const run = async (fn) => {
    setBusy(true);
    try {
      const res = await fn();
      setLastRefusal(res?.ok === false ? (res.reasons || [res.reason || '거부됨']).join(' · ') : null);
    } catch (e) {
      setLastRefusal(`브리지에 닿지 못했습니다 — ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  // 이름이 같아도 **토큰이 없으면 내 것이 아니다** — 그래야 다시 잡을 길이 열린다.
  // 이름만 보고 판단하면 새로고침 뒤 반납·DISARM 이 전부 거부되며 갇힌다 (2026-08-04 실측)
  const sameName = who && state.owner === who;
  const mine = sameName && datasource.hasOwnerToken();
  const armed = state.phase === 'ARMED' || state.phase === 'EXECUTING';

  // 지금 몇 번째 칸인가 — 처음 온 사람은 순서를 모른다. 회색 버튼은 순서를 안 알려준다
  // (감사 2026-08-06 P1 · Program 이 이미 쓰던 규칙을 여기로 옮겼다).
  const step = !who.trim() ? 0 : !state.connected ? 1 : !mine ? 2 : !armed ? 3 : 4;
  const STEPS = ['이름 적기', '로봇에 연결', '조종권 잡기', 'ARM 하기', '조작 가능'];

  return (
    <div className="live">
      <ol className="startguide" data-t="startguide">
        {STEPS.map((label, i) => (
          <li key={label} data-at={String(i === step)} data-done={String(i < step)}>{label}</li>
        ))}
      </ol>

      <section className="card diag" data-t="diag">
        <h2>연결 진단</h2>
        <label>로봇 프로필
          <select value={picked} disabled={state.connected || busy}
            onChange={(e) => setPicked(e.target.value)}>
            {robots.map((r) => (
              <option key={r.robotId} value={r.robotId}>{r.name} · {r.endpoint}</option>
            ))}
          </select>
        </label>
        {state.connected
          ? <button type="button" onClick={() => run(() => datasource.disconnect(who))} disabled={busy}>연결 해제</button>
          : <button type="button" className="primary" onClick={() => run(() => datasource.connect(picked))}
              disabled={busy || !picked}>
              연결 (보기만 · observe-only)
            </button>}
        {!state.connected && (
          <p className="hint">붙어서 값만 읽습니다. 이 단계에서는 로봇이 움직이지 않습니다.</p>
        )}
        {lastRefusal && <p className="refusal" data-t="refusal"><b>거부됨</b> {lastRefusal}</p>}
        {state.phase === 'FAIL_CLOSED' && state.failReason
          && <p className="refusal" data-t="refusal"><b>FAIL_CLOSED</b> {state.failReason}</p>}
        <dl>
          <dt>브리지 재접속</dt><dd className="ws-reconnects" data-t="ws-reconnects">{datasource.wsReconnects()}회</dd>
          {version && <>
            <dt>SDK</dt><dd>{version.sdk ?? '미보고'}</dd>
            <dt>컨트롤러</dt><dd>{version.controller ?? '미보고'}</dd>
          </>}
        </dl>
      </section>

      <section className="card control" data-t="control">
        <h2>조종권 · 명령</h2>
        {!state.connected && <p className="hint">먼저 위에서 연결하면 조종권을 잡을 수 있습니다.</p>}
        {state.connected && (
          <>
            {/* **회색 버튼은 이유를 안 알려준다** — 툴팁은 손가락에 안 뜬다 (감사 2026-08-06 P1).
                못 누르는 이유를 문장으로 적는다. Program 이 쓰던 규칙과 같은 모양이다 */}
            {!mine && !who.trim() && (
              <p className="hint" data-t="claim-blocked">
                이름부터 적으세요. 화면 오른쪽 위 <b>이름</b> 칸입니다.
              </p>
            )}
            {mine
              ? <button type="button" onClick={() => run(() => datasource.releaseOwner(who))} disabled={busy}>
                  조종권 반납
                </button>
              : <button type="button" className="primary" disabled={busy || !who}
                  data-t="claim"
                  onClick={() => run(() => datasource.claimOwner(who))}>
                  {sameName ? '조종권 다시 잡기' : '조종권 잡기'}
                  {state.owner && state.owner !== who ? ` (현재 ${state.owner})` : ''}
                </button>}
            {sameName && !mine && (
              <p className="hint" data-t="token-lost">
                이름은 {who} 로 잡혀 있지만 이 창에는 증표가 없습니다.
                (새로고침하면 이렇게 됩니다.) 다시 잡으면 새 증표를 받습니다.
              </p>
            )}
            {mine && !armed && (
              <div className="armrow">
                <label className="confirm" data-t="confirm">
                  <input type="checkbox" checked={siteConfirmed}
                    onChange={(e) => setSiteConfirmed(e.target.checked)} />
                  현장에 사람이 있고 즉시 정지할 수 있다
                </label>
                <button type="button" className="arm" data-t="arm" disabled={busy || !siteConfirmed}
                  onClick={() => run(() => datasource.arm(who))}>
                  ARM (움직일 수 있게)
                </button>
                {!siteConfirmed
                  ? <p className="hint" data-t="arm-blocked">위 칸에 체크하면 ARM 할 수 있습니다.</p>
                  : <p className="hint">누르면 서보가 켜지고 아래 조작대가 열립니다.</p>}
              </div>
            )}
            {mine && armed && (
              <>
                <button type="button" onClick={() => run(() => datasource.disarm(who))} disabled={busy}>
                  DISARM (다시 잠그기)
                </button>
                <p className="hint">누르면 서보가 꺼지고 조작대가 닫힙니다.</p>
              </>
            )}
            {/* 모드 토글은 헤더 안전 바에, 조그·그리퍼는 아래 조작대에 있다 — 둘 다 상시다 */}
          </>
        )}
      </section>

      {/* **연결 전에는 표를 안 그린다** (감사 2026-08-06 P1). 붙기 전 이 두 표는 12행이
          전부 `—` 였고, 첫 화면에서 제일 넓은 면적을 아무 뜻 없는 대시가 먹었다. 그 자리는
          「지금 무엇을 하면 되나」 가 쓸 자리다 (위 startguide). 연결되면 그대로 돌아온다. */}
      {state.connected && (
        <>
          <section className="card">
            <h2>관절 각도 (°)</h2>
            <table className="joints" data-t="joints"><tbody>
              {JOINT_LABELS.map((name, i) => (
                <tr key={name}><th>{name}</th>
                  <td>{state.jointsDeg[i].toFixed(3)}</td></tr>
              ))}
            </tbody></table>
          </section>
          <section className="card">
            <h2>손끝 위치 · TCP (mm·°)</h2>
            <table className="tcp" data-t="tcp"><tbody>
              {TCP_LABELS.map((name, i) => (
                <tr key={name}><th>{name}</th>
                  <td>{state.tcpMmDeg[i].toFixed(3)}</td></tr>
              ))}
            </tbody></table>
          </section>
        </>
      )}
    </div>
  );
}
