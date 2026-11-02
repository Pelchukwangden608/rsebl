import { useRef, useState } from 'react';
import { reducedMotion } from './ui.jsx';

/* Card that tilts in 3D toward the pointer and shows a soft light that follows it. Disabled on touch screens and with reduced motion. */
export function Tilt({ className = '', children, ...rest }) {
  const ref = useRef(null);
  const [enabled] = useState(
    () => typeof window !== 'undefined' && !reducedMotion() && !!window.matchMedia?.('(pointer: fine)').matches,
  );

  const onMove = (e) => {
    const el = ref.current;
    if (!enabled || !el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - y) * 6}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 8}deg`);
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <div ref={ref} className={`tilt ${className}`} onMouseMove={onMove} onMouseLeave={onLeave} {...rest}>
      {children}
    </div>
  );
}

/* Card that turns over in 3D on click, or with Enter or Space, to show more detail. */
export function FlipCard({ front, back, className = '', label }) {
  const [flipped, setFlipped] = useState(false);
  const toggle = () => setFlipped((f) => !f);
  return (
    <div
      className={`flip ${className} ${flipped ? 'is-flipped' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={label ? `${label}. ${flipped ? 'Showing details' : 'Select to show details'}` : undefined}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div className="flip-inner">
        <div className="flip-face flip-front">{front}</div>
        <div className="flip-face flip-back">{back}</div>
      </div>
    </div>
  );
}
