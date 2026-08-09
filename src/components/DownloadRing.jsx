import { useEffect, useState } from 'react';
import { downloadBus } from '../lib/downloadBus.js';
import './DownloadRing.css';

const R    = 9;
const CIRC = 2 * Math.PI * R; // ≈ 56.55

export default function DownloadRing() {
  const [dl, setDl]       = useState({});
  const [hover, setHover] = useState(false);

  useEffect(() => downloadBus.subscribe(setDl), []);

  const items = Object.values(dl);
  if (items.length === 0) return null;

  return (
    <div
      className="dl-ring-wrap"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        className="dl-ring-btn"
        aria-label={`${items.length} download${items.length > 1 ? 's' : ''} in progress`}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" className="dl-ring-svg">
          {/* track */}
          <circle
            cx="12" cy="12" r={R}
            fill="none"
            stroke="var(--border)"
            strokeWidth="2.5"
          />
          {/* spinning arc */}
          <circle
            cx="12" cy="12" r={R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${(CIRC * 0.72).toFixed(2)} ${(CIRC * 0.28).toFixed(2)}`}
            className="dl-ring-arc"
          />
        </svg>

        {items.length > 1 && (
          <span className="dl-ring-badge">{items.length}</span>
        )}
      </button>

      {hover && (
        <div className="dl-ring-popover">
          <p className="dl-ring-pop-title">Downloading</p>
          {items.map((d) => (
            <div key={d.id} className="dl-ring-pop-row">
              <span className="dl-ring-pop-dot" />
              <span className="dl-ring-pop-name">{d.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
