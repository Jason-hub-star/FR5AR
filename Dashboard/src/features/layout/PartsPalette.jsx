// 부품 팔레트 — 좌측 패널. **고르면 방 가운데 놓인다.**
//
// 목록을 여기서 만들지 않는다 — `Shared/data/layout/catalog.js` 가 SSOT 다.
// 그래야 부품을 더해도 이 파일을 안 고친다 (codegate `PartsPalette` 와 같은 규약).
//
// **끌어다 놓을 수 있다** (2026-08-04). 눌러서 놓으면 방 가운데, **끌어다 놓으면 그 자리**다.
//
// 전에는 "배치 모드라는 상태가 하나 더 생긴다" 는 이유로 안 했는데, 그건 *클릭 후 조준*
// 방식의 이야기였다. HTML5 끌어놓기는 **브라우저가 그 상태를 들고 있어서** 우리 쪽에
// 모드가 안 생긴다 — 끌기가 끝나면 흔적도 안 남는다.

import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, VISIBLE, cardKey, kindOf } from '@fr5/shared/data/layout/catalog.js';
import { thumbFor, disposeThumbs } from '@fr5/shared/view3d/thumb.js';

const MOUNT_BADGE = { wall: '벽', bench: '작업대 위' };
// **자리는 소품이 아니다** — 배지로 갈라 준다. 시나리오가 이 이름으로 부른다
const KIND_BADGE = { station: '자리' };
// 문·창은 팩토리가 없어 구울 것이 없다 — 대신 납작한 기호를 그린다
const OPENING_ICON = { door: '▯', window: '▭', station: '◎' };

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
        {CATEGORIES.map(({ id, label, note }) => {
          const items = hits.filter((c) => c.category === id);
          if (!items.length) return null;           // 빈 분류는 숨긴다
          return (
            <section key={id}>
              <h4>{label}</h4>
              {/* 분류마다 한 줄 안내 — **어디에 놓나**가 안 적혀 있어 헤맸다 (2026-08-04) */}
              {note && <p className="palette-note">{note}</p>}
              {items.map((c) => (
                <button
                  key={cardKey(c)}
                  type="button"
                  className="part-card"
                  onClick={() => onPlace(c)}
                  draggable
                  onDragStart={(e) => {
                    // 카드 **객체**를 못 실으므로 키만 싣고 받는 쪽이 카탈로그에서 찾는다
                    e.dataTransfer.setData('text/fr5-card', cardKey(c));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title={c.hint ?? c.label}
                >
                  <span className="part-thumb" aria-hidden="true">
                    {thumbs[cardKey(c)]
                      ? <img src={thumbs[cardKey(c)]} alt="" />
                      : <i>{OPENING_ICON[kindOf(c)] ?? ''}</i>}
                  </span>
                  <span className="part-text">
                    <span className="part-name">{c.label}</span>
                    {(KIND_BADGE[kindOf(c)] ?? MOUNT_BADGE[c.mount])
                      && <span className="part-badge">{KIND_BADGE[kindOf(c)] ?? MOUNT_BADGE[c.mount]}</span>}
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

