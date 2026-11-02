/* Shared chart styling so every chart reads as one system. */

export const AXIS_TICK = { fill: '#8b93a7', fontSize: 11 };
export const GRID_STROKE = 'rgba(148, 163, 184, 0.14)';
export const UP = '#10b981';
export const DOWN = '#f43f5e';

export const toneColor = (change) => (change === null || change === undefined || change >= 0 ? UP : DOWN);

/* Tooltip card with a clear name for each series and a formatted value. */
export function ChartTooltip({ active, payload, label, formatValue }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-date mono">{label}</div>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <div key={p.dataKey} className="chart-tip-row">
            <span className="chart-tip-dot" style={{ background: p.color || p.stroke }} />
            <span>{p.name}</span>
            <span className="mono">{formatValue(p.value)}</span>
          </div>
        ))}
    </div>
  );
}
