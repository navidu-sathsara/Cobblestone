import './SideRail.css';

const NAV = [
  { id: 'play', label: 'Play', iconSrc: '/nav-play.png' },
  { id: 'instances', label: 'Instances', iconSrc: '/nav-instances.png' },
  { id: 'content', label: 'Content', iconSrc: '/nav-content.png' },
  { id: 'store', label: 'Store', iconSrc: '/nav-store.png', external: true },
];

const FOOT = [{ id: 'settings', label: 'Settings', iconSrc: '/nav-settings.png' }];

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
            <img src={iconSrc} alt="" draggable="false" />
          </span>
          <span className="rail-label">{label}</span>
          {external ? <span className="rail-external" aria-hidden="true">↗</span> : null}
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
