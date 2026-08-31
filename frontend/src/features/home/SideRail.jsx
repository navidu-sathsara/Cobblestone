import { Handshake, LayoutGrid, Play, Settings, ShoppingCart, Sparkles } from 'lucide-react';
import './SideRail.css';

/**
 * Instances and Content are full local-library screens. Community/store links
 * remain routed by the home shell so they can share its trusted URL policy.
 */
const NAV = [
  { id: 'play', label: 'Play', Icon: Play },
  { id: 'instances', label: 'Instances', Icon: LayoutGrid },
  { id: 'content', label: 'Content', Icon: Sparkles },
  { id: 'partners', label: 'Partners', Icon: Handshake },
  { id: 'store', label: 'Store', Icon: ShoppingCart },
];

export default function SideRail({ active = 'play', onNavigate = () => {}, version }) {
  const item = ({ id, label, Icon }) => {
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
        </button>
      </li>
    );
  };

  return (
    <nav className="rail" aria-label="Primary">
      <ul className="rail-list">{NAV.map(item)}</ul>

      <ul className="rail-list rail-list--foot">{[{ id: 'settings', label: 'Settings', Icon: Settings }].map(item)}</ul>

      <span className="rail-version" data-testid="rail-version">{version ? `v${version}` : ''}</span>
    </nav>
  );
}
