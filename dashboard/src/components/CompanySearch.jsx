import { useEffect, useMemo, useState } from 'react';
import { peers } from '../data.js';
import { clsOf, fmt, signed } from '../lib/format.js';

/* Company search. Arrow keys move through the results, Enter selects, Escape closes. Press "/" anywhere to focus it. */
export default function CompanySearch({ id = 'company-search', selected, onSelect }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  const matches = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return peers;
    return peers.filter((p) => p.symbol.toLowerCase().includes(ql) || p.name.toLowerCase().includes(ql));
  }, [q]);

  useEffect(() => setIdx(0), [q]);

  const pick = (sym) => {
    onSelect(sym);
    setQ('');
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setIdx((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && matches[idx]) {
      e.preventDefault();
      pick(matches[idx].symbol);
    } else if (e.key === 'Escape') {
      setOpen(false);
      e.currentTarget.blur();
    }
  };

  return (
    <div className="company-search">
      <input
        id={id}
        value={q}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label="Find a company"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={`Find a company (now viewing ${selected})`}
        autoComplete="off"
      />
      <kbd className="kbd-hint" aria-hidden="true">/</kbd>
      {open && (
        <div className="search-dropdown" role="listbox">
          {matches.length === 0 && <div className="search-empty">No company matches "{q}".</div>}
          {matches.map((p, i) => (
            <div
              key={p.symbol}
              role="option"
              aria-selected={p.symbol === selected}
              className={'search-row' + (p.symbol === selected ? ' current' : '') + (i === idx ? ' active' : '')}
              onMouseEnter={() => setIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(p.symbol); }}
            >
              <span className="sym">{p.symbol}</span>
              <span className="sname">{p.name}</span>
              <span className={'spx mono ' + clsOf(p.pct_change)}>
                {fmt(p.price)} ({signed(p.pct_change)}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
