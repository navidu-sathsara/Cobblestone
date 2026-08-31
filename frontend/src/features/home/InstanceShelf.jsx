import { Plus } from 'lucide-react';
import { formatBuild, formatInstallState, formatPlaytime } from '../../lib/format.js';
import './InstanceShelf.css';

const STATE_TONE = {
  ready: 'ok',
  installing: 'busy',
  broken: 'bad',
};

/**
 * Horizontal shelf of every instance the backend reports. Clicking a card makes
 * it the launch target, so the hero and this shelf always agree.
 */
export default function InstanceShelf({ instances, activeId, onSelect, onCreate }) {
  return (
    <section className="shelf" data-testid="instance-shelf">
      <header className="shelf-head">
        <h2 className="eyebrow eyebrow--muted">Your Instances</h2>
        <span className="shelf-count">{instances.length}</span>
      </header>

      <div className="shelf-track scroll-thin">
        {instances.map((item, index) => {
          const current = item.id === activeId;
          return (
            <button
              type="button"
              key={item.id}
              className={`instance-card${current ? ' instance-card--active' : ''}`}
              aria-pressed={current}
              data-testid={`instance-card-${item.id}`}
              style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
              onClick={() => onSelect(item.id)}
            >
              <span className={`instance-state instance-state--${STATE_TONE[item.installState] || 'idle'}`}>
                {formatInstallState(item.installState)}
              </span>
              <span className="instance-name">{item.name}</span>
              <span className="instance-build">{formatBuild(item)}</span>
              <span className="instance-time">{formatPlaytime(item.playTimeSeconds)}</span>
            </button>
          );
        })}

        <button
          type="button"
          className="instance-card instance-card--new"
          data-testid="instance-card-new"
          onClick={() => onCreate()}
        >
          <span className="instance-new-glyph">
            <Plus size={17} strokeWidth={2.8} />
          </span>
          <span className="instance-name">New instance</span>
          <span className="instance-build">Latest release, vanilla</span>
        </button>
      </div>
    </section>
  );
}
