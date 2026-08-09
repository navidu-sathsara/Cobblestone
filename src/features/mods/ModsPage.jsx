import { useEffect, useRef, useState } from 'react';
import { Search, Download, Check, Loader2, Trash2, PackageOpen } from 'lucide-react';
import Dropdown from '../../components/ui/Dropdown.jsx';
import useInstalledMods from './useInstalledMods.js';
import DepInstallModal from './DepInstallModal.jsx';
import { cfHeaders, PROVIDER_ICONS } from '../../lib/cfApi.js';
import { hydrateInstalledProjects } from '../../lib/contentApi.js';
import './ModsPage.css';

const TABS = [
  { id: 'mod',          label: 'Mods' },
  { id: 'shader',       label: 'Shaders' },
  { id: 'resourcepack', label: 'Resource Packs' },
  { id: 'datapack',     label: 'Datapacks' },
  { id: 'installed',    label: 'Installed' },
];

const SORTS = [
  { value: 'downloads', label: 'Sort by: Downloads' },
  { value: 'relevance', label: 'Sort by: Relevance' },
  { value: 'newest',    label: 'Sort by: Newest' },
  { value: 'updated',   label: 'Sort by: Updated' },
];

// CurseForge class IDs for Minecraft (gameId=432)
const CF_CLASS = { mod: 6, shader: 6552, resourcepack: 12, datapack: 6945 };
// CurseForge sortField values
const CF_SORT  = { downloads: 6, relevance: 2, newest: 1, updated: 3 };

const PAGE_SIZE = 24;

export const formatCount = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`;

const normalizeCF = (mod) => ({
  project_id: `cf:${mod.id}`,
  cf_id:      mod.id,
  source:     'cf',
  title:      mod.name,
  icon_url:   mod.logo?.thumbnailUrl ?? null,
  author:     mod.authors?.[0]?.name ?? '',
  downloads:  mod.downloadCount ?? 0,
  description: mod.summary ?? '',
  versions:   [...new Set((mod.latestFilesIndexes ?? []).map((f) => f.gameVersion))].slice(-3).reverse(),
});

// Both providers can repeat a project across page boundaries when the ranking
// shifts mid-scroll, and a repeat would collide on the React key.
const appendUnique = (previous, incoming) => {
  const seen = new Set(previous.map((item) => item.project_id));
  return [...previous, ...incoming.filter((item) => !seen.has(item.project_id))];
};

export default function ModsPage({ store, onOpenMod = () => {}, onPackInstalled = () => {} }) {
  const { instances, selected, select } = store;

  const [tab,      setTab]      = useState('mod');
  const [query,    setQuery]    = useState('');
  const [sort,     setSort]     = useState('downloads');
  const [provider, setProvider] = useState('modrinth');
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [depModal, setDepModal] = useState(null);
  const [page,     setPage]     = useState(0);
  const [more,     setMore]     = useState(false);
  const [paging,   setPaging]   = useState(false);
  const sentinelRef             = useRef(null);

  const { installed, busy, errors, install, remove } = useInstalledMods(selected);

  const modInstances = instances.filter((i) => i.loader !== 'Vanilla');
  const tabLabel     = TABS.find((t) => t.id === tab)?.label ?? 'content';
  const contentType  = tab === 'installed' ? 'mod' : tab;

  // A new query/sort/tab/provider is a different feed, so paging starts over.
  useEffect(() => { setPage(0); }, [query, sort, tab, provider]);

  // Search — Modrinth or CurseForge. Page 0 replaces the feed; later pages append.
  useEffect(() => {
    if (tab === 'installed') return undefined;
    const controller = new AbortController();
    const first = page === 0;
    if (first) setLoading(true); else setPaging(true);

    const timer = setTimeout(async () => {
      try {
        const offset = page * PAGE_SIZE;
        let batch;
        if (provider === 'modrinth') {
          const url =
            `https://api.modrinth.com/v2/search?limit=${PAGE_SIZE}&offset=${offset}&index=${sort}` +
            `&query=${encodeURIComponent(query)}` +
            `&facets=${encodeURIComponent(JSON.stringify([[`project_type:${tab}`]]))}`;
          const data = await (await fetch(url, { signal: controller.signal })).json();
          batch = data.hits ?? [];
        } else {
          const classId   = CF_CLASS[tab] ?? 6;
          const sortField = CF_SORT[sort]  ?? 6;
          const url =
            `https://api.curseforge.com/v1/mods/search` +
            `?gameId=432&classId=${classId}&searchFilter=${encodeURIComponent(query)}` +
            `&sortField=${sortField}&sortOrder=desc&pageSize=${PAGE_SIZE}&index=${offset}`;
          const data = await (await fetch(url, { headers: cfHeaders, signal: controller.signal })).json();
          batch = (data.data ?? []).map(normalizeCF);
        }
        // A short page means the feed is exhausted, so the sentinel stops firing.
        setMore(batch.length === PAGE_SIZE);
        setResults((prev) => (first ? batch : appendUnique(prev, batch)));
      } catch (error) {
        if (error.name === 'AbortError') return;
        setMore(false);
        if (first) setResults([]);
      } finally {
        setLoading(false);
        setPaging(false);
      }
    }, first && query ? 350 : 0);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, sort, tab, provider, page]);

  // Infinite scroll: advance a page when the sentinel below the grid comes into
  // view. Re-observed on every dependency change because the node is remounted
  // whenever the grid is replaced by the loading or empty state.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !more || loading || paging || tab === 'installed') return undefined;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setPage((value) => value + 1); },
      { rootMargin: '320px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, loading, paging, tab, results.length]);

  // Installed tab: combine persisted metadata with either provider's project API.
  useEffect(() => {
    if (tab !== 'installed') return;
    const controller = new AbortController();
    if (Object.keys(installed).length === 0) { setResults([]); setLoading(false); return undefined; }
    setLoading(true);
    hydrateInstalledProjects(installed, { signal: controller.signal })
      .then(setResults)
      .catch((error) => { if (error.name !== 'AbortError') setResults([]); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [tab, installed]);

  return (
    <div className="mods">
      <div className="mods-toolbar">
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

        {tab !== 'installed' && (
          <div className="provider-toggle">
            <button
              className={`provider-btn${provider === 'modrinth' ? ' active' : ''}`}
              onClick={() => setProvider('modrinth')}
              title="Modrinth"
            >
              <img src={PROVIDER_ICONS.modrinth} className="provider-icon" alt="" />
              <span className="provider-label">Modrinth</span>
            </button>
            <button
              className={`provider-btn${provider === 'curseforge' ? ' active' : ''}`}
              onClick={() => setProvider('curseforge')}
              title="CurseForge"
            >
              <img src={PROVIDER_ICONS.curseforge} className="provider-icon" alt="" />
              <span className="provider-label">CurseForge</span>
            </button>
          </div>
        )}
      </div>

      <div className="mods-filters">
        <div className="search-box">
          <Search size={15} />
          <input
            type="text"
            placeholder={`Search ${tabLabel.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="mods-filter-dd">
          <Dropdown value={sort} options={SORTS} onChange={setSort} />
        </div>
        {tab !== 'installed' && (
          <div className="mods-filter-dd mods-filter-instance">
            <Dropdown
              value={selected?.id}
              options={modInstances.map((i) => ({
                value: i.id,
                label: `For: ${i.name} (${i.loader} ${i.version})`,
              }))}
              onChange={select}
            />
          </div>
        )}
      </div>

      <div className="mods-body">
        {loading ? (
          <div className="mods-status">
            <Loader2 size={22} className="spin" /> Loading {tabLabel.toLowerCase()}…
          </div>
        ) : results.length === 0 ? (
          <div className="mods-status">
            <PackageOpen size={26} />
            {tab === 'installed'
              ? 'Nothing installed on this instance yet.'
              : `No ${tabLabel.toLowerCase()} found.`}
          </div>
        ) : (
          <div className="mods-grid">
            {results.map((mod) => {
              const isInstalled = Boolean(installed[mod.project_id]);
              const isBusy      = Boolean(busy[mod.project_id]);
              const error       = errors[mod.project_id];
              return (
                <article
                  className="mod-card"
                  key={mod.project_id}
                  onClick={() => onOpenMod(mod.project_id)}
                >
                  {mod.icon_url ? (
                    <img className="mod-icon" src={mod.icon_url} alt="" loading="lazy" />
                  ) : (
                    <span className="mod-icon mod-icon-fallback">
                      {mod.title[0]?.toUpperCase()}
                    </span>
                  )}
                  <div className="mod-info">
                    <strong title={mod.title}>{mod.title}</strong>
                    <small className={error ? 'mod-error' : ''}>
                      {error ??
                        `${mod.author ? `by ${mod.author} · ` : ''}${formatCount(mod.downloads)} downloads`}
                    </small>
                  </div>
                  {isBusy ? (
                    <span className="mod-action busy">
                      <Loader2 size={15} className="spin" />
                    </span>
                  ) : isInstalled ? (
                    <button
                      className="mod-action installed"
                      title="Remove"
                      onClick={(e) => { e.stopPropagation(); remove(mod.project_id); }}
                    >
                      <Check size={15} className="mod-check" />
                      <Trash2 size={15} className="mod-trash" />
                    </button>
                  ) : (
                    <button
                      className="mod-action"
                      title={`Install to ${selected?.name ?? 'instance'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (contentType === 'mod') {
                          setDepModal({ mod });
                        } else {
                          install(mod, contentType);
                        }
                      }}
                    >
                      <Download size={15} />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {tab !== 'installed' && !loading && results.length > 0 && (
          <div className="mods-more" ref={sentinelRef}>
            {paging ? (
              <span className="mods-more-load">
                <Loader2 size={16} className="spin" /> Loading more…
              </span>
            ) : more ? null : (
              <span className="mods-more-end">
                That’s all {results.length} {tabLabel.toLowerCase()}.
              </span>
            )}
          </div>
        )}
      </div>

      {depModal && (
        <DepInstallModal
          mod={depModal.mod}
          instance={selected}
          installed={installed}
          onClose={() => setDepModal(null)}
          onConfirm={async (selectedDeps, resolvedMod) => {
            setDepModal(null);
            for (const dep of selectedDeps) await install(dep, 'mod');
            await install(resolvedMod ?? depModal.mod, 'mod');
          }}
        />
      )}
    </div>
  );
}
