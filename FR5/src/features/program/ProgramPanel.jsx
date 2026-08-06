// Program 패널 — 지점을 순서로 엮어 승인한 것만 한 단계씩 실행한다 (PROGRAM-CONTRACT.md).
//
// **여기는 녹화하지 않는다.** 찍는 것은 Teach, 되짚는 것은 History 다 (계획 §화면).
//
// 초심자가 따라올 수 있게 세 가지를 지킨다:
//   ① 지금 몇 번째 칸인지 **번호로** 보인다  ② 버튼은 **지금 할 한 가지**만 말한다
//   ③ 못 누를 때는 회색으로 죽이지 않고 **왜인지 적는다** — 회색 버튼은 이유를 안 알려준다
//
// 안전 판정은 전부 서버가 한다. 여기 disabled 는 편의지 안전장치가 아니다 (SAFETY-RULES 제2원칙).
import { useCallback, useEffect, useState } from 'react';
import { datasource } from '../../data/datasource/index.js';

// 서버는 커서를 안 든다 (D78) — "지금 여기" 는 화면이 센다. 그래서 중단해도 재개할 상태가
// 서버에 없고, 처음부터 다시 도는 사고도 구조적으로 없다.
export function ProgramPanel({ state, who, onView }) {
  const [slots, setSlots] = useState([]);
  const [points, setPoints] = useState([]);
  const [pick, setPick] = useState('');           // 지금 열어 둔 슬롯 이름
  const [newName, setNewName] = useState('');
  const [addPoint, setAddPoint] = useState('');
  const [cursor, setCursor] = useState(0);        // 다음에 실행할 단계
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const mine = !!who && state.owner === who && datasource.hasOwnerToken();
  const armed = state.phase === 'ARMED' || state.phase === 'EXECUTING';

  const reload = useCallback(async () => {
    const [ss, ps] = await Promise.all([datasource.getSlots(), datasource.getPoints()]);
    setSlots(Array.isArray(ss) ? ss : []);
    setPoints(Array.isArray(ps) ? ps : []);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const run = async (fn) => {
    setBusy(true);
    try {
      const res = await fn();
      setNote(res?.ok === false ? (res.reasons || [res.reason || '거부됨']).join(' · ') : null);
      await reload();
      return res;
    } finally { setBusy(false); }
  };

  const slot = slots.find((s) => s.name === pick) || null;
  const steps = slot?.steps || [];
  const approved = slot?.status === 'approved';
  const done = cursor >= steps.length;

  // 다음에 갈 자세를 3D 에 미리 띄운다 — **누르기 전에 어디로 가는지 본다.**
  // 로봇에 아무것도 안 보낸다 (twinnote 가 "아직 안 보냈다" 고 말한다).
  useEffect(() => {
    const target = preview && slot && !done ? steps[cursor]?.pointName : null;
    const p = target && points.find((x) => x.name === target);
    onView(p ? { jointsDeg: p.jointsDeg, gripperPct: p.gripperPct,
      label: `${p.name} 로 가면 이 자세다. 아직 안 보냈다` } : null);
  }, [preview, slot, done, cursor, steps, points, onView]);
  useEffect(() => () => onView(null), [onView]);

  // 슬롯을 바꾸거나 단계가 바뀌면 처음으로 — 옛 칸 번호로 엉뚱한 단계를 실행하지 않는다
  useEffect(() => { setCursor(0); setConfirmed(false); }, [pick, steps.length, slot?.status]);

  const setSteps = (next) => run(() => datasource.saveSlot(who, slot.name, next));

  // 못 누르는 이유를 **문장으로** 돌려준다. null 이면 누를 수 있다.
  const blockedWhy = () => {
    if (!mine) return '조종권을 잡으면 실행할 수 있습니다. Live 탭에서 잡으세요.';
    if (!approved) return '먼저 승인하세요. 승인해야 실기에서 실행됩니다.';
    if (!armed) return 'ARM 하면 실행할 수 있습니다. Live 탭에서 현장확인 후 ARM 하세요.';
    if (done) return '마지막 단계까지 끝났습니다. 처음부터 다시 하려면 아래를 누르세요.';
    return null;
  };
  const why = blockedWhy();

  return (
    <div className="program" data-t="program">
      <section>
        <h3>프로그램</h3>
        <p className="mm">지점을 순서로 엮고, 승인한 뒤 한 단계씩 실행한다.</p>
        <div className="row">
          <input value={newName} placeholder="이름 (예: 집기시연)" data-t="slot-name"
            onChange={(e) => setNewName(e.target.value)} />
          <button type="button" data-t="slot-create"
            disabled={!mine || busy || !newName.trim() || !points.length}
            title={points.length ? '' : '지점을 먼저 만든다'}
            onClick={() => run(() => datasource.saveSlot(who, newName.trim(),
              [{ type: 'move', pointName: points[0].name }]))
              .then((r) => { if (r?.ok !== false) { setPick(newName.trim()); setNewName(''); } })}>
            만들기
          </button>
        </div>
        {!points.length && (
          <p className="mm" data-t="no-points">
            지점이 없습니다. Teach 탭에서 자세를 캡처하면 여기서 순서로 엮을 수 있습니다.
          </p>
        )}
        {!slots.length && points.length > 0 && (
          <p className="empty" data-t="slots-empty">아직 프로그램이 없습니다. 이름을 짓고 만드세요.</p>
        )}
        {slots.length > 0 && (
          <ul className="slotlist" data-t="slots">
            {slots.map((s) => (
              <li key={s.name}>
                <button type="button" data-t="slot-row" data-name={s.name}
                  aria-selected={s.name === pick} onClick={() => setPick(s.name)}>
                  {s.name}
                  <span className="mm">{s.status === 'approved' ? '승인됨' : '작성 중'}
                    {' · '}{(s.steps || []).length}단계</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {slot && (
        <section data-t="slot-open">
          <h3>{slot.name}</h3>
          <ol className="steps" data-t="steps">
            {steps.map((st, i) => (
              <li key={i} data-t="step-row" data-index={i}
                data-at={String(approved && i === cursor)}>
                <span className="stepname">{st.pointName} 으로</span>
                {approved
                  ? <span className="mm">{i < cursor ? '끝남' : i === cursor ? '지금 여기' : ''}</span>
                  : (
                    <button type="button" data-t="step-remove" disabled={!mine || busy || steps.length <= 1}
                      title={steps.length > 1 ? '' : '단계가 하나뿐이면 못 뺀다'}
                      onClick={() => setSteps(steps.filter((_, k) => k !== i))}>빼기</button>
                  )}
              </li>
            ))}
          </ol>

          {!approved && (
            <>
              <div className="row">
                <select value={addPoint} data-t="point-pick"
                  onChange={(e) => setAddPoint(e.target.value)}>
                  <option value="">지점 고르기</option>
                  {points.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
                <button type="button" data-t="step-add" disabled={!mine || busy || !addPoint}
                  onClick={() => setSteps([...steps, { type: 'move', pointName: addPoint }])
                    .then(() => setAddPoint(''))}>
                  뒤에 넣기
                </button>
              </div>
              {/* 확인 절차는 한 모양이다 — 체크박스 + 실행 버튼 (계획 §확인 절차) */}
              <label className="confirm" data-t="approve-confirm">
                <input type="checkbox" checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)} />
                승인하면 이 {steps.length}단계가 실기에서 실행됩니다
              </label>
              <button type="button" className="arm" data-t="slot-approve"
                disabled={!mine || busy || !confirmed}
                onClick={() => run(() => datasource.approveSlot(who, slot.name))}>
                승인
              </button>
              {!mine && <p className="hint">조종권을 잡으면 승인할 수 있습니다.</p>}
            </>
          )}

          {approved && (
            <>
              {why
                ? <p className="hint" data-t="step-blocked">{why}</p>
                : (
                  <>
                    <button type="button" className="arm" data-t="step-run" disabled={busy}
                      onClick={() => run(() => datasource.slotStep(who, slot.name, cursor))
                        .then((r) => { if (r?.ok !== false) setCursor(cursor + 1); })}>
                      {cursor + 1}단계 실행
                    </button>
                    <p className="hint">
                      누르면 로봇이 실제로 움직입니다. <b>한 칸만</b> 갑니다.
                    </p>
                  </>
                )}
              <label className="confirm">
                <input type="checkbox" checked={preview}
                  onChange={(e) => setPreview(e.target.checked)} />
                다음에 갈 자세를 3D 로 미리 보기
              </label>
              <div className="row">
                {/* 커서만 되돌린다 — 로봇은 안 움직인다 (서버는 커서를 안 든다 · D78) */}
                <button type="button" data-t="cursor-reset" disabled={busy || cursor === 0}
                  onClick={() => setCursor(0)}>1단계로 돌아가기</button>
                {/* 같은 목록을 다시 저장해 draft 로 되돌린다 — 버튼 이름이 그 일을 말한다.
                    "고치기" 라고 적으면 단계가 바뀐 줄 알고, 승인이 풀린 것을 못 본다 */}
                <button type="button" data-t="slot-unapprove" disabled={!mine || busy}
                  onClick={() => setSteps(steps)}>승인 풀기</button>
              </div>
            </>
          )}

          <div className="row">
            <button type="button" data-t="slot-delete" disabled={!mine || busy}
              onClick={() => run(() => datasource.deleteSlot(who, slot.name))
                .then(() => setPick(''))}>
              이 프로그램 지우기
            </button>
          </div>
        </section>
      )}

      {note && <p className="refusal" data-t="program-refusal"><b>거부됨</b> {note}</p>}
    </div>
  );
}
