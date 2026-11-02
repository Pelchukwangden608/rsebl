import { useEffect, useMemo, useRef, useState } from 'react';
import { peers, timelines } from '../data.js';
import { Tilt } from '../components/Tilt.jsx';

export default function TimelinePanel({ symbol }) {
  const peer = peers.find((p) => p.symbol === symbol);
  const all = timelines[symbol] || [];
  const [query, setQuery] = useState('');
  const [openSet, setOpenSet] = useState(() => new Set());
  const [visible, setVisible] = useState(() => new Set());
  const refs = useRef([]);

  const items = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return all
      .map((t, index) => ({ ...t, index }))
      .filter((t) => !ql || t.title.toLowerCase().includes(ql) || (t.desc || '').toLowerCase().includes(ql));
  }, [all, query]);

  // Each milestone fades in as it scrolls into view. Without IntersectionObserver, everything is shown.
  useEffect(() => {
    setVisible(new Set());
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(new Set(all.map((_, i) => i)));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            const i = Number(en.target.dataset.idx);
            setVisible((v) => new Set(v).add(i));
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: '0px 0px -40px 0px' },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [symbol, items.length]);

  const toggleOpen = (i) =>
    setOpenSet((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const allOpen = items.length > 0 && items.every((t) => openSet.has(t.index));
  const setAll = (open) => setOpenSet(open ? new Set(items.map((t) => t.index)) : new Set());

  return (
    <div className="panel">
      <header className="page-head">
        <p className="eyebrow">History</p>
        <h2>{peer?.name}</h2>
        <p className="lede">Key events in the company's history, from its founding to the present.</p>
      </header>

      <Tilt className="card">
        <div className="card-head wrap">
          <div>
            <h3>Milestones</h3>
            <p className="muted small">{items.length} of {all.length} events shown. Select an event to read more.</p>
          </div>
          <div className="toolbar">
            <input
              className="field"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events"
              aria-label="Search events"
            />
            <button className="btn" onClick={() => setAll(!allOpen)} disabled={items.length === 0}>
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="empty">
            {all.length === 0 ? 'No history has been recorded for this company yet.' : 'No events match your search.'}
          </p>
        ) : (
          <ol className="timeline">
            {items.map((t, n) => {
              const isOpen = openSet.has(t.index);
              const shown = visible.has(t.index);
              return (
                <li
                  key={t.index}
                  ref={(el) => (refs.current[n] = el)}
                  data-idx={t.index}
                  className={'tl-item' + (shown ? ' visible' : '')}
                >
                  <button className={'tl-card' + (isOpen ? ' open' : '')} aria-expanded={isOpen} onClick={() => toggleOpen(t.index)}>
                    <span className="tl-date">{t.date}</span>
                    <span className="tl-title">{t.title}</span>
                    {isOpen && (
                      <span className="tl-body">
                        <span className="tl-desc">{t.desc}</span>
                        <span className="tl-src">
                          Source:{' '}
                          <a href={t.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            {t.source}
                          </a>
                        </span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Tilt>
    </div>
  );
}
