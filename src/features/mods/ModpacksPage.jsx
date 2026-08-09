import { useEffect, useState } from 'react';
import { Search, Download, Loader2, PackageOpen, Gamepad2 } from 'lucide-react';
import Dropdown from '../../components/ui/Dropdown.jsx';
import InstallPackModal from './InstallPackModal.jsx';
import './ModpacksPage.css';

const formatCount = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`;

const SORTS = [
  { value: 'downloads', label: 'Sort by: Downloads' },
  { value: 'relevance', label: 'Sort by: Relevance' },
  { value: 'newest',    label: 'Sort by: Newest' },
  { value: 'updated',   label: 'Sort by: Updated' },
];

export default function ModpacksPage({ store, onOpenMod = () => {}, onPackInstalled = () => {} }) {
  const [query,     setQuery]     = useState('');
  const [sort,      setSort]      = useState('downloads');
  const [results,   setResults]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [packModal, setPackModal] = useState(null);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const url =
          `https://api.modrinth.com/v2/search?limit=24&index=${sort}` +
          `&query=${encodeURIComponent(query)}` +
          `&facets=${encodeURIComponent(JSON.stringify([['project_type:modpack']]))}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Search failed (${response.status})`);
        const data = await response.json();
        setResults(data.hits ?? []);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [query, sort]);

  return (
    <div className="modpacks">
      <div className="modpacks-filters">
        <div className="search-box">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search modpacks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="mods-filter-dd">
          <Dropdown value={sort} options={SORTS} onChange={setSort} />
        </div>
      </div>

      <div className="modpacks-body">
        {loading ? (
          <div className="mods-status">
            <Loader2 size={22} className="spin" /> Loading modpacks…
          </div>
        ) : results.length === 0 ? (
          <div className="mods-status">
            <PackageOpen size={26} />
            No modpacks found.
          </div>
        ) : (
          <div className="modpacks-grid">
            {results.map((pack) => {
              const latestMc = pack.versions?.slice(-3).reverse() ?? [];
              return (
                <article
                  className="pack-card"
                  key={pack.project_id}
                  onClick={() => onOpenMod(pack.project_id)}
                >
                  {pack.icon_url ? (
                    <img className="pack-card-icon" src={pack.icon_url} alt="" loading="lazy" />
                  ) : (
                    <span className="pack-card-icon pack-card-icon-fallback">
                      {pack.title[0]?.toUpperCase()}
                    </span>
                  )}

                  <div className="pack-card-body">
                    <div className="pack-card-top">
                      <strong title={pack.title}>{pack.title}</strong>
                      {pack.author && (
                        <span className="pack-card-author">by {pack.author}</span>
                      )}
                    </div>
                    <p className="pack-card-desc">{pack.description}</p>
                    <div className="pack-card-meta">
                      <span className="pack-card-dl">{formatCount(pack.downloads)} ↓</span>
                      {latestMc.length > 0 && (
                        <span className="pack-card-mc">
                          <Gamepad2 size={10} />
                          {latestMc.join(' · ')}
                          {(pack.versions?.length ?? 0) > 3 && ' …'}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    className="pack-card-install"
                    title="Install as new instance"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPackModal(pack);
                    }}
                  >
                    <Download size={15} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {packModal && (
        <InstallPackModal
          project={packModal}
          onClose={() => setPackModal(null)}
          onInstalled={(instance) => {
            store.add(instance);
            setPackModal(null);
            onPackInstalled(instance.id);
          }}
        />
      )}
    </div>
  );
}
