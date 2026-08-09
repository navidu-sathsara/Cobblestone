import { useMemo, useState } from 'react';
import { Plus, Boxes, Search, Gamepad2, CircleCheck } from 'lucide-react';
import Dropdown from '../../components/ui/Dropdown.jsx';
import InstanceModal from './InstanceModal.jsx';
import { LOADER_ICONS } from '../../lib/cfApi.js';
import './InstancesPage.css';

const TABS = [
  { id: 'all', label: 'All Instances' },
  { id: 'Vanilla', label: 'Vanilla' },
  { id: 'Fabric', label: 'Fabric' },
  { id: 'Forge', label: 'Forge' }
];

const SORTS = [
  { value: 'name', label: 'Sort by: Name' },
  { value: 'lastPlayed', label: 'Sort by: Last Played' },
  { value: 'created', label: 'Sort by: Created' }
];

export default function InstancesPage({ store, onOpen = () => {} }) {
  const { instances, selected, select, create } = store;
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [creating, setCreating] = useState(false);

  const shown = useMemo(() => {
    const filtered = instances.filter(
      (i) =>
        (tab === 'all' || i.loader === tab) &&
        i.name.toLowerCase().includes(query.trim().toLowerCase())
    );
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'lastPlayed') return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0);
      return (b.created ?? 0) - (a.created ?? 0);
    });
  }, [instances, tab, query, sort]);

  return (
    <div className="instances">
      <div className="instances-toolbar">
        <div className="pill-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`pill-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="accent-btn" onClick={() => setCreating(true)}>
          <Plus size={15} /> New Instance
        </button>
      </div>

      <div className="instances-filters">
        <div className="search-box">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search instances…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="instances-filter-dd">
          <Dropdown value={sort} options={SORTS} onChange={setSort} />
        </div>
      </div>

      <div className="instances-body">
        {shown.length === 0 ? (
          <div className="instances-empty">
            <Boxes size={38} />
            <p>{instances.length === 0 ? 'No instances yet.' : 'No instances match.'}</p>
            {instances.length === 0 && (
              <button className="accent-btn" onClick={() => setCreating(true)}>
                <Plus size={15} /> Create your first instance
              </button>
            )}
          </div>
        ) : (
          <div className="inst-grid">
            {shown.map((instance) => {
              const isActive = selected?.id === instance.id;
              return (
                <article
                  className="inst-row"
                  key={instance.id}
                  onClick={() => onOpen(instance.id)}
                >
                  {instance.icon ? (
                    <img className="inst-row-icon inst-icon-img" src={instance.icon} alt="" loading="lazy" />
                  ) : LOADER_ICONS[instance.loader] ? (
                    <img
                      className="inst-row-icon inst-loader-img"
                      src={LOADER_ICONS[instance.loader]}
                      alt={`${instance.loader} logo`}
                    />
                  ) : (
                    <span className="inst-row-icon" style={{ background: instance.color }}>
                      <Boxes size={22} />
                    </span>
                  )}
                  <div className="inst-row-info">
                    <strong>
                      {instance.name}
                      {isActive && <span className="inst-active-chip">Active</span>}
                    </strong>
                    <small>
                      <Gamepad2 size={12} /> {instance.loader} {instance.version}
                    </small>
                  </div>
                  {!isActive && (
                    <button
                      className="inst-row-select"
                      title="Set as active instance"
                      onClick={(e) => {
                        e.stopPropagation();
                        select(instance.id);
                      }}
                    >
                      <CircleCheck size={17} />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <InstanceModal
          initial={null}
          onClose={() => setCreating(false)}
          onSave={(values) => {
            create(values);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
