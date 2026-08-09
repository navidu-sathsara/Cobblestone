import {
  Gamepad2,
  Boxes,
  Puzzle,
  Package,
  Globe,
  Newspaper,
  ShoppingCart,
  Settings,
  LockKeyhole
} from 'lucide-react';
import appIcon from '../../../icon.png';
import './Sidebar.css';

const NAV = [
  { id: 'play',      icon: Gamepad2,      label: 'Play' },
  { id: 'instances', icon: Boxes,         label: 'Instances' },
  { id: 'mods',      icon: Puzzle,        label: 'Mods' },
  { id: 'modpacks',  icon: Package,       label: 'Modpacks' },
  { id: 'servers',   icon: Globe,         label: 'Servers' },
  { id: 'news',      icon: Newspaper,     label: 'News' },
  { id: 'store',     icon: ShoppingCart,  label: 'Store' }
];

export default function Sidebar({ active = 'play', locked = false, onNavigate = () => {} }) {
  return (
    <aside className={`sidebar${locked ? ' sidebar--locked' : ''}`}>
      <div className="sidebar-logo">
        <img src={appIcon} alt="Native" />
        {locked && (
          <span className="sidebar-lock-badge" title="Navigation locked while installing">
            <LockKeyhole size={10} />
          </span>
        )}
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`sidebar-item${id === active ? ' active' : ''}`}
            title={locked ? 'Game files are being installed' : label}
            aria-label={label}
            disabled={locked}
            onClick={() => onNavigate(id)}
          >
            <Icon size={21} />
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button
          className={`sidebar-item${active === 'settings' ? ' active' : ''}`}
          title={locked ? 'Game files are being installed' : 'Settings'}
          aria-label="Settings"
          disabled={locked}
          onClick={() => onNavigate('settings')}
        >
          <Settings size={21} />
        </button>
        <span className="sidebar-version">v0.1.0</span>
      </div>
    </aside>
  );
}
