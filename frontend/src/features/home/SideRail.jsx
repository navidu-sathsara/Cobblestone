import { Handshake, LayoutGrid, Play, Settings, ShoppingCart, Sparkles } from 'lucide-react';
import './SideRail.css';

/**
 * Primary navigation. Play, Instances, Content, Partners and Settings are real
 * routed screens; Store is an external link the shell opens through its trusted
 * URL policy.
 */
const NAV = [
  { id: 'play', label: 'Play', Icon: Play },
  { id: 'instances', label: 'Instances', Icon: LayoutGrid },
  { id: 'content', label: 'Content', Icon: Sparkles },
  { id: 'partners', label: 'Partners', Icon: Handshake },
  { id: 'store', label: 'Store', Icon: ShoppingCart, external: true },
];

const FOOT = [{ id: 'settings', label: 'Settings', Icon: Settings }];

export default function SideRail({ active = 'play', onNavigate = () => {}, version }) {
  const item = ({ id, label, Icon, external }) => {
    const current = id === active;
    return (
      <li key={id}>
        <button
          type="button"
          className={`rail-item${current ? ' rail-item--active' : ''}`}
          aria-current={current ? 'page' : undefined}
          data-testid={`rail-${id}`}
          onClick={() => onNavigate(id)}
        >
          <span className="rail-glyph">
            <Icon size={18} strokeWidth={2.2} />
          </span>
          <span className="rail-label">{label}</span>
          {external ? <span className="rail-external" aria-hidden="true" /> : null}
        </button>
      </li>
    );
  };

  return (
    <nav className="rail" aria-label="Primary" data-testid="side-rail">
      <ul className="rail-list">{NAV.map(item)}</ul>
      <ul className="rail-list rail-list--foot">{FOOT.map(item)}</ul>
      <span className="rail-version" data-testid="rail-version">{version ? `v${version}` : ''}</span>
    </nav>
  );
}
