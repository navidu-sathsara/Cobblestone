import { Gamepad2, Handshake, LayoutGrid, Settings, ShoppingCart } from 'lucide-react';
import './SideRail.css';

/**
 * Only "Play" has a screen so far; the rest are declared here so the rail is
 * complete and the active-state styling is exercised.
 */
const NAV = [
  { id: 'play', label: 'Play', Icon: Gamepad2 },
  { id: 'profiles', label: 'Profiles', Icon: LayoutGrid },
  { id: 'partners', label: 'Partners', Icon: Handshake },
  { id: 'store', label: 'Store', Icon: ShoppingCart },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export default function SideRail({ active = 'play', onNavigate = () => {}, version }) {
  return (
    <nav className="rail" aria-label="Primary">
      <ul className="rail-list">
        {NAV.map(({ id, label, Icon }) => {
          const current = id === active;
          return (
            <li key={id}>
              <button
                type="button"
                className={`rail-item${current ? ' rail-item--active' : ''}`}
                aria-current={current ? 'page' : undefined}
                onClick={() => onNavigate(id)}
              >
                <Icon size={19} strokeWidth={2.1} />
                <span className="rail-label">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <span className="rail-version">{version ? `v${version}` : ''}</span>
    </nav>
  );
}
