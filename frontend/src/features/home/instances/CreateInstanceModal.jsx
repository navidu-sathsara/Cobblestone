import { useEffect, useState } from 'react';
import { Blocks, LoaderCircle, Plus, X } from 'lucide-react';
import { bridge } from '../../../lib/bridge.js';

const LOADERS = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'];

const label = (id) => (id === 'neoforge' ? 'NeoForge' : id[0].toUpperCase() + id.slice(1));

export default function CreateInstanceModal({ onClose, onCreated, onError }) {
  const [versions, setVersions] = useState([]);
  const [loaderVersions, setLoaderVersions] = useState([]);
  const [name, setName] = useState('New instance');
  const [minecraftVersion, setMinecraftVersion] = useState('');
  const [loader, setLoader] = useState('fabric');
  const [loaderVersion, setLoaderVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    bridge.versions.list({ types: ['release', 'snapshot'], limit: 100 })
      .then((items) => {
        if (cancelled) return;
        setVersions(items || []);
        setMinecraftVersion(items?.[0]?.id || '');
      })
      .catch((error) => onError(error.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onError]);

  useEffect(() => {
    if (!minecraftVersion || loader === 'vanilla') {
      setLoaderVersions([]);
      setLoaderVersion('');
      return undefined;
    }
    let cancelled = false;
    setLoaderVersion('');
    bridge.loaders.list(loader, minecraftVersion)
      .then((items) => {
        if (cancelled) return;
        setLoaderVersions(items || []);
        setLoaderVersion((items || []).find((item) => item.stable)?.version || items?.[0]?.version || '');
      })
      .catch((error) => { if (!cancelled) onError(error.message); });
    return () => { cancelled = true; };
  }, [loader, minecraftVersion, onError]);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim() || !minecraftVersion || saving) return;
    setSaving(true);
    try {
      const created = await bridge.instances.create({
        name: name.trim(),
        minecraftVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? null : loaderVersion || null,
      });
      await onCreated(created);
      onClose();
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui-modal-backdrop" data-testid="create-instance-modal">
      <form
        className="ui-modal ui-modal--wide"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-instance-title"
      >
        <header className="ui-modal-head">
          <span>
            <small>Instance builder</small>
            <strong id="create-instance-title">Create an instance</strong>
          </span>
          <button
            type="button"
            className="ui-modal-close"
            aria-label="Close"
            data-testid="create-instance-close"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="ui-modal-body">
          <label className="ui-field">
            <span>Name</span>
            <input
              value={name}
              maxLength={120}
              autoFocus
              data-testid="create-instance-name"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="ui-field">
            <span>Mod loader</span>
            <div className="create-loader-grid" role="group" aria-label="Mod loader">
              {LOADERS.map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={loader === id}
                  className={`create-loader${loader === id ? ' create-loader--active' : ''}`}
                  data-testid={`create-instance-loader-${id}`}
                  onClick={() => setLoader(id)}
                >
                  <Blocks size={15} />
                  {label(id)}
                </button>
              ))}
            </div>
          </div>

          <div className="ui-form-grid">
            <label className="ui-field">
              <span>Minecraft version</span>
              <select
                value={minecraftVersion}
                disabled={loading}
                data-testid="create-instance-version"
                onChange={(event) => setMinecraftVersion(event.target.value)}
              >
                {versions.map((item) => (
                  <option key={item.id} value={item.id}>{item.id} · {item.type}</option>
                ))}
              </select>
            </label>

            <label className="ui-field">
              <span>Loader version</span>
              <select
                value={loaderVersion}
                disabled={loader === 'vanilla'}
                data-testid="create-instance-loader-version"
                onChange={(event) => setLoaderVersion(event.target.value)}
              >
                {loader === 'vanilla' ? <option value="">Not applicable</option> : null}
                {loader !== 'vanilla' && !loaderVersions.length
                  ? <option value="">Resolve recommended automatically</option>
                  : null}
                {loaderVersions.map((item) => (
                  <option key={item.version} value={item.version}>
                    {item.version}{item.stable ? ' · stable' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="create-note">
            Files download on the first launch, so an instance is created instantly and verified later.
          </p>
        </div>

        <footer className="ui-modal-actions">
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className="ui-btn ui-btn--primary"
            disabled={saving || loading || !name.trim() || !minecraftVersion}
            data-testid="create-instance-submit"
          >
            {saving ? <LoaderCircle className="ui-spin" size={15} /> : <Plus size={16} />}
            Create instance
          </button>
        </footer>
      </form>
    </div>
  );
}
