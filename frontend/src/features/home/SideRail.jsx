import { Boxes, Handshake, Play, Settings, ShoppingBag, Sparkles } from 'lucide-react';
import './SideRail.css';

/**
 * Only "Play" has a screen so far; the rest are declared here so the rail is
 * complete and the active-state styling is exercised.
 */
const NAV = [
  { id: 'play', label: 'Play', Icon: Play },
  { id: 'profiles', label: 'Profiles', Icon: Boxes },
  { id: 'content', label: 'Content', Icon: Sparkles },
  { id: 'partners', label: 'Partners', Icon: Handshake },
  { id: 'store', label: 'Store', Icon: ShoppingBag },
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
