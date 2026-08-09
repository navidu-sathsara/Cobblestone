import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Gamepad2, Puzzle, Tag, Package } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Dropdown from '../../components/ui/Dropdown.jsx';
import './InstallPackModal.css';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function InstallPackModal({ project, onClose = () => {}, onInstalled = () => {} }) {
  const projectId = project.project_id ?? project.id;
  const [versions, setVersions]     = useState(null);   // all pack versions
  const [mcFilter, setMcFilter]     = useState(null);   // selected MC game version
  const [versionId, setVersionId]   = useState(null);   // selected pack version id
  const [name, setName]             = useState(project.title ?? '');
  const [fullProject, setFullProject] = useState(null);
  const [installing, setInstalling] = useState(null);   // { percent, detail }
  const [error, setError]           = useState('');

  // Load all pack versions
  useEffect(() => {
    fetch(`https://api.modrinth.com/v2/project/${projectId}/version`)
      .then((r) => r.json())
      .then((vs) => {
        const list = Array.isArray(vs) ? vs : [];
        setVersions(list);
        if (list.length > 0) {
          const gvs = list[0].game_versions;
          setMcFilter(gvs[gvs.length - 1] ?? null);
          setVersionId(list[0].id);
        }
      })
      .catch(() => setVersions([]));
  }, [projectId]);

  // Load full project for description + categories
  useEffect(() => {
    fetch(`https://api.modrinth.com/v2/project/${projectId}`)
      .then((r) => r.json())
      .then(setFullProject)
      .catch(() => {});
  }, [projectId]);

  // Progress listener
  useEffect(() => {
    const off = window.native?.modpacks?.onProgress?.((p) => {
      if (p.projectId === projectId)
        setInstalling({ percent: p.percent, detail: p.detail });
    });
    return off;
  }, [projectId]);

  // Unique MC versions across all pack versions (newest first)
  const mcOptions = useMemo(() => {
    if (!versions) return [];
    const seen = new Set();
    const opts = [];
    for (const v of versions) {
      for (const gv of [...v.game_versions].reverse()) {
        if (!seen.has(gv)) {
          seen.add(gv);
          opts.push({ value: gv, label: gv });
        }
      }
    }
    return opts;
  }, [versions]);

  // Pack versions filtered to the selected MC version
  const filteredVersions = useMemo(() => {
    if (!versions) return [];
    if (!mcFilter) return versions;
    return versions.filter((v) => v.game_versions.includes(mcFilter));
  }, [versions, mcFilter]);

  // Auto-select first compatible pack version whenever the filter changes
  useEffect(() => {
    setVersionId(filteredVersions[0]?.id ?? null);
  }, [filteredVersions]);

  const selectedVersion = filteredVersions.find((v) => v.id === versionId);
  const desc = fullProject?.description ?? project.description ?? '';
  const categories = fullProject?.categories ?? project.display_categories ?? [];

  const startInstall = async () => {
    if (!window.native?.modpacks) {
      setError('Install works in the desktop app only');
      return;
    }
    setInstalling({ percent: 0, detail: 'Starting…' });
    setError('');
    try {
      const instance = await window.native.modpacks.install({ projectId, versionId, name });
      onInstalled(instance);
    } catch (err) {
      setInstalling(null);
      setError(String(err.message ?? err).replace(/^.*'modpack:install': (Error: )?/, ''));
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !installing && onClose()}>
      <div className="modal pack-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="pack-modal-head">
          {project.icon_url ? (
            <img className="pack-modal-icon" src={project.icon_url} alt="" />
          ) : (
            <span className="pack-modal-icon pack-modal-icon-fallback">
              <Package size={22} />
            </span>
          )}
          <div className="pack-modal-head-info">
            <h3>{project.title}</h3>
            {project.author && (
              <span className="pack-modal-subtitle">by {project.author}</span>
            )}
          </div>
          <button className="modal-close" onClick={onClose} disabled={Boolean(installing)}>
            <X size={16} />
          </button>
        </div>

        {/* ── Description + tags banner ── */}
        {(desc || categories.length > 0) && (
          <div className="pack-modal-info">
            {desc && <p className="pack-modal-desc">{desc}</p>}
            {categories.length > 0 && (
              <div className="pack-modal-tags">
                <Tag size={10} />
                {categories.slice(0, 5).map((c) => (
                  <span key={c} className="pack-modal-tag">{c}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Instance name ── */}
        <label className="field">
          <span>Instance name</span>
          <input
            type="text"
            value={name}
            placeholder={project.title}
            autoFocus
            disabled={Boolean(installing)}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {/* ── MC version + pack version — two columns ── */}
        <div className="pack-modal-ver-row">
          <div className="field">
            <span>Minecraft version</span>
            {versions === null ? (
              <div className="pack-modal-loading">
                <Loader2 size={13} className="spin" /> Loading…
              </div>
            ) : (
              <Dropdown value={mcFilter} options={mcOptions} onChange={setMcFilter} />
            )}
          </div>
          <div className="field">
            <span>Pack version</span>
            {versions === null ? (
              <div className="pack-modal-loading">
                <Loader2 size={13} className="spin" /> Loading…
              </div>
            ) : filteredVersions.length === 0 ? (
              <div className="pack-modal-loading">None for this MC release.</div>
            ) : (
              <Dropdown
                value={versionId}
                options={filteredVersions.map((v) => ({
                  value: v.id,
                  label: v.version_number,
                }))}
                onChange={setVersionId}
              />
            )}
          </div>
        </div>

        {/* ── Selected version badges ── */}
        {selectedVersion && (
          <div className="pack-modal-badges">
            <span className="pack-badge pack-badge-mc">
              <Gamepad2 size={11} />
              MC {selectedVersion.game_versions.slice(-3).reverse().join(', ')}
              {selectedVersion.game_versions.length > 3 && ' …'}
            </span>
            {selectedVersion.loaders.map((l) => (
              <span key={l} className="pack-badge pack-badge-loader">
                <Puzzle size={11} />
                {cap(l)}
              </span>
            ))}
          </div>
        )}

        {/* ── Install progress ── */}
        {installing && (
          <div className="pack-modal-progress">
            <div className="pack-modal-bar">
              <div style={{ width: `${installing.percent}%` }} />
            </div>
            <small>{installing.detail}</small>
          </div>
        )}

        {error && <p className="pack-modal-error">{error}</p>}

        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose} disabled={Boolean(installing)}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={startInstall}
            disabled={Boolean(installing) || !versionId}
          >
            {installing ? `Installing ${installing.percent}%` : 'Install'}
          </Button>
        </div>
      </div>
    </div>
  );
}
