import './SideRail.css';

const NAV = [
  { id: 'play', label: 'Play', iconSrc: '/play_icon.jpg' },
  { id: 'instances', label: 'Instances', iconSrc: '/instances_icon.jpg' },
  { id: 'content', label: 'Content', iconSrc: '/content_icon.jpg' },
  { id: 'store', label: 'Store', iconSrc: '/store_icon.jpg', external: true },
];

const FOOT = [{ id: 'settings', label: 'Settings', iconSrc: '/settings_icon.jpg' }];

export default function SideRail({ active = 'play', onNavigate = () => {}, version }) {
  const item = ({ id, label, iconSrc, external }) => {
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
            <img src={iconSrc} alt="" style={{ width: 18, height: 18 }} />
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
