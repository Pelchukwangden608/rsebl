import { peersAsOf } from '../data.js';

const time = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

export default function LiveBanner({ live }) {
  const { status, fetchedAt } = live;
  const copy = {
    loading: ['Loading live prices from RSEB…', 'pending'],
    live: [`Live prices from RSEB · updated ${time(fetchedAt)}`, 'live'],
    partial: [`Some RSEB data could not be loaded · prices updated ${time(fetchedAt)}`, 'partial'],
    stale: [`RSEB is not responding right now · showing prices from ${time(fetchedAt)}`, 'stale'],
    offline: [`Live service offline · showing saved snapshot from ${peersAsOf}`, 'offline'],
  }[status];
  const [text, tone] = copy;
  return (
    <div className={`live-banner ${tone}`} role="status" aria-live="polite">
      <span className="live-dot" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
