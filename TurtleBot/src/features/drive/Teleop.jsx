// 가상 조이스틱 + 키보드(WASD) — 워치독 500ms 라 잡고 있는 동안 계속 보낸다.
// 상한 검사는 서버(mock 포함)가 한다. 여기는 상한 안의 값만 만들어 보낸다.
import { useEffect, useRef, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';

const SEND_MS = 150;               // 워치독 500ms 보다 충분히 짧게
const LINEAR_MAX = 150, ANGULAR_MAX = 60;
const PAD = 130;                   // 패드 지름 px

export function Teleop({ robot, who }) {
  const [vel, setVel] = useState({ linearMmS: 0, angularDegS: 0 });
  const [reason, setReason] = useState('');
  const velRef = useRef(vel);
  const keysRef = useRef(new Set());
  const padRef = useRef(null);

  velRef.current = vel;

  // 잡고 있는 동안 주기 전송 — 놓으면 보내지 않는다 → 워치독이 세운다
  useEffect(() => {
    const timer = setInterval(() => {
      const v = velRef.current;
      if (v.linearMmS === 0 && v.angularDegS === 0) return;
      const res = datasource.teleop(robot, v.linearMmS, v.angularDegS, who);
      setReason(res.ok ? '' : res.reason);
    }, SEND_MS);
    return () => clearInterval(timer);
  }, [robot, who]);

  // 키보드 — W/S 전후진 · A/D 회전
  useEffect(() => {
    const fromKeys = () => {
      const k = keysRef.current;
      setVel({
        linearMmS: (k.has('w') ? LINEAR_MAX : 0) + (k.has('s') ? -LINEAR_MAX : 0),
        angularDegS: (k.has('a') ? ANGULAR_MAX : 0) + (k.has('d') ? -ANGULAR_MAX : 0),
      });
    };
    const down = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ('wasd'.includes(e.key)) { keysRef.current.add(e.key); fromKeys(); }
    };
    const up = (e) => { keysRef.current.delete(e.key); fromKeys(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // 포인터 — 패드 중심 대비 오프셋이 속도가 된다 (위 = 전진)
  const onPointer = (e) => {
    if (e.buttons !== 1 && e.type !== 'pointerdown') return;
    const rect = padRef.current.getBoundingClientRect();
    const dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    setVel({
      linearMmS: Math.round(Math.max(-1, Math.min(1, -dy)) * LINEAR_MAX),
      angularDegS: Math.round(Math.max(-1, Math.min(1, -dx)) * ANGULAR_MAX),
    });
  };
  const release = () => setVel({ linearMmS: 0, angularDegS: 0 });

  return (
    <div className="teleop">
      <div className="teleop-pad" ref={padRef} style={{ width: PAD, height: PAD }}
           onPointerDown={onPointer} onPointerMove={onPointer}
           onPointerUp={release} onPointerLeave={release}>
        <div className="teleop-knob" style={{
          transform: `translate(${(-vel.angularDegS / ANGULAR_MAX) * PAD * 0.3}px,
                                ${(-vel.linearMmS / LINEAR_MAX) * PAD * 0.3}px)`,
        }} />
      </div>
      <div className="teleop-readout">
        <div>선속도 <b>{vel.linearMmS >= 0 ? '+' : ''}{vel.linearMmS}</b> mm/s</div>
        <div>각속도 <b>{vel.angularDegS >= 0 ? '+' : ''}{vel.angularDegS}</b> °/s</div>
        <div className="teleop-note">상한 |{LINEAR_MAX}|·|{ANGULAR_MAX}| · watchdog 500ms · WASD 가능</div>
        {reason && <div className="teleop-reason">{reason}</div>}
      </div>
    </div>
  );
}
