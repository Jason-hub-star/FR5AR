// 부품 팔레트 — 좌측 패널. **고르면 방 가운데 놓인다.**
//
// 목록을 여기서 만들지 않는다 — `Shared/data/layout/catalog.js` 가 SSOT 다.
// 그래야 부품을 더해도 이 파일을 안 고친다 (codegate `PartsPalette` 와 같은 규약).
//
// **천장** — 지금은 클릭하면 **방 가운데**에 놓고, 옮기는 것은 기존 끌기가 한다.
// 바닥을 찍은 자리에 놓으려면 `interaction.js` 의 floor 레이캐스트를 팔레트와
// 연결해야 하는데, 그건 배치 모드라는 상태가 하나 더 생기는 일이라 지금은 안 한다.

import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, VISIBLE, cardKey, kindOf } from '@fr5/shared/data/layout/catalog.js';
import { thumbFor, disposeThumbs } from '@fr5/shared/view3d/thumb.js';

const MOUNT_BADGE = { wall: '벽', bench: '작업대 위' };
// 문·창은 팩토리가 없어 구울 것이 없다 — 대신 납작한 기호를 그린다
const OPENING_ICON = { door: '▯', window: '▭' };

export function PartsPalette({ onPlace, count }) {
  const [q, setQ] = useState('');

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return VISIBLE;
    return VISIBLE.filter((c) => c.label.toLowerCase().includes(s)
      || c.id.toLowerCase().includes(s)
      || (c.hint ?? '').toLowerCase().includes(s));
  }, [q]);

  // 썸네일은 **한 번만 굽는다.** 목록이 뜬 뒤 비동기로 채워 첫 렌더를 안 막는다 —
  // 부품 17종을 동기로 구우면 팔레트가 그만큼 늦게 뜬다.
  const [thumbs, setThumbs] = useState({});
  useEffect(() => {
    let alive = true;
    const id = requestAnimationFrame(() => {
      const next = {};
      for (const c of VISIBLE) {
        if (kindOf(c) !== 'prop') continue;
        next[cardKey(c)] = thumbFor(c.id, c.opts ?? {}, 96);
      }
      if (alive) setThumbs(next);
    });
    return () => { alive = false; cancelAnimationFrame(id); disposeThumbs(); };
  }, []);

  return (
    <aside className="palette">
      <div className="palette-head">
        <h3>부품 팔레트</h3>
        <p>고르면 방 가운데 놓여요. 끌어서 옮기고 <kbd>R</kbd> 로 돌려요.</p>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="부품 검색…"
          aria-label="부품 검색"
        />
      </div>

      <div className="palette-list">
        {CATEGORIES.map(({ id, label }) => {
          const items = hits.filter((c) => c.category === id);
          if (!items.length) return null;           // 빈 분류는 숨긴다
          return (
            <section key={id}>
              <h4>{label}</h4>
              {items.map((c) => (
                <button
                  key={cardKey(c)}
                  type="button"
                  className="part-card"
                  onClick={() => onPlace(c)}
                  title={c.hint ?? c.label}
                >
                  <span className="part-thumb" aria-hidden="true">
                    {thumbs[cardKey(c)]
                      ? <img src={thumbs[cardKey(c)]} alt="" />
                      : <i>{OPENING_ICON[kindOf(c)] ?? ''}</i>}
                  </span>
                  <span className="part-text">
                    <span className="part-name">{c.label}</span>
                    {MOUNT_BADGE[c.mount] && <span className="part-badge">{MOUNT_BADGE[c.mount]}</span>}
                    {c.hint && <span className="part-hint">{c.hint}</span>}
                  </span>
                </button>
              ))}
            </section>
          );
        })}
        {hits.length === 0 && <p className="palette-empty">“{q}” 검색 결과 없음</p>}
      </div>

      <div className="palette-foot">
        <span>놓인 것 {count}개 · 고르고 <kbd>Del</kbd> 로 치워요</span>
      </div>
    </aside>
  );
}
