import { useEffect, useRef, useState } from 'react';
import { X, Box } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Dropdown from '../../components/ui/Dropdown.jsx';
import { LOADER_ICONS } from '../../lib/cfApi.js';

const FALLBACK_VERSIONS = [
  '1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.20.1',
  '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.9'
];

const LOADERS = ['Vanilla', 'Fabric', 'Forge'];

const COLORS = ['#ffffff', '#ff4133', '#e8a33d', '#4fb254', '#3aa4dc', '#7b61ff', '#c136c9'];

let versionCache = null;

async function fetchVersions() {
  if (versionCache) return versionCache;
  const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
  const manifest = await res.json();
  versionCache = manifest.versions.filter((v) => v.type === 'release').map((v) => v.id);
  return versionCache;
}

export default function InstanceModal({ initial = null, onClose, onSave }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [version, setVersion] = useState(initial?.version ?? FALLBACK_VERSIONS[0]);
  const [loader, setLoader] = useState(initial?.loader ?? 'Vanilla');
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [icon, setIcon] = useState(initial?.icon ?? null);
  const [versions, setVersions] = useState(FALLBACK_VERSIONS);
  const fileRef = useRef(null);

  useEffect(() => {
    fetchVersions()
      .then(setVersions)
      .catch(() => {}); // keep fallback list offline
  }, []);

  const valid = name.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    const loaderVersion =
      loader === initial?.loader && version === initial?.version
        ? initial?.loaderVersion ?? null
        : null;
    onSave({ name: name.trim(), version, loader, loaderVersion, color, icon });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{initial ? 'Edit Instance' : 'New Instance'}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <label className="field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            placeholder="My Awesome Instance"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>

        <div className="field">
          <span>Icon</span>
          <div className="inst-icon-row">
            <button
              type="button"
              className="inst-icon-picker"
              style={{ background: icon ? 'transparent' : color }}
              onClick={() => fileRef.current?.click()}
            >
              {icon
                ? <img src={icon} className="inst-icon-preview" alt="" />
                : <Box size={20} />
              }
            </button>
            <div className="inst-icon-info">
              <span className="inst-icon-hint">
                {icon ? 'Custom icon set — click to change' : 'Click to upload a custom icon'}
              </span>
              {icon && (
                <button type="button" className="inst-icon-clear" onClick={() => setIcon(null)}>
                  Remove
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setIcon(reader.result);
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="field">
          <span>Minecraft Version</span>
          <Dropdown value={version} options={versions} onChange={setVersion} />
        </div>

        <div className="field">
          <span>Mod Loader</span>
          <div className="loader-row">
            {LOADERS.map((l) => (
              <button
                key={l}
                className={`loader-pill${l === loader ? ' active' : ''}`}
                onClick={() => setLoader(l)}
                title={l}
              >
                <img src={LOADER_ICONS[l]} className="loader-pill-icon" alt={l} />
                <span className="loader-pill-label">{l}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Color</span>
          <div className="color-row">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color-swatch${c === color ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={submit} disabled={!valid}>
            {initial ? 'Save Changes' : 'Create Instance'}
          </Button>
        </div>
      </div>
    </div>
  );
}
