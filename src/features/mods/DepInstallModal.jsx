import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckSquare,
  Download,
  Gamepad2,
  HardDrive,
  Loader2,
  PackageCheck,
  Puzzle,
  RotateCw,
  ShieldCheck,
  Square,
  X
} from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { LOADER_ICONS, PROVIDER_ICONS } from '../../lib/cfApi.js';
import { getInstallPlan, isCurseForgeProject, projectKey } from '../../lib/contentApi.js';
import './DepInstallModal.css';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function DepRow({ dep, checked, disabled, installed, onChange }) {
  return (
    <label className={`dep-row${disabled ? ' dep-required' : ''}${installed ? ' dep-installed' : ''}`}>
      <span className="dep-checkbox" aria-hidden="true">
        {installed ? <Check size={16} /> : checked ? <CheckSquare size={16} /> : <Square size={16} />}
      </span>
      <input
        type="checkbox"
        className="dep-checkbox-input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(dep.project_id, event.target.checked)}
      />
      {dep.icon_url ? (
        <img className="dep-icon" src={dep.icon_url} alt="" loading="lazy" />
      ) : (
        <span className="dep-icon dep-icon-fallback">
          {dep.title?.[0]?.toUpperCase() ?? '?'}
        </span>
      )}
      <span className="dep-info">
        <strong>{dep.title ?? dep.project_id}</strong>
        <small>{installed ? 'Already installed on this instance' : dep.description || 'Additional library required by this mod'}</small>
      </span>
      <span className={`dep-kind dep-kind--${installed ? 'installed' : disabled ? 'required' : 'optional'}`}>
        {installed ? 'Installed' : disabled ? 'Required' : 'Optional'}
      </span>
    </label>
  );
}

export default function DepInstallModal({ mod, instance, installed = {}, onClose, onConfirm }) {
  const [state, setState] = useState('loading');
  const [deps, setDeps] = useState([]);
  const [checked, setChecked] = useState({});
  const [release, setRelease] = useState(null);
  const [resolvedMod, setResolvedMod] = useState(mod);
  const [errMsg, setErrMsg] = useState('');
  const [requestId, setRequestId] = useState(0);
  const compatibleTarget = Boolean(instance && instance.loader !== 'Vanilla');
  const provider = isCurseForgeProject(mod) ? 'curseforge' : 'modrinth';
  const providerName = provider === 'curseforge' ? 'CurseForge' : 'Modrinth';

  // Read through a ref so a manifest update never re-runs the plan fetch: the
  // install set only needs to know what was on disk when the dialog opened.
  const installedRef = useRef(installed);
  installedRef.current = installed;
  const onDisk = (dep) => Boolean(installed[projectKey(dep)]);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setErrMsg('');
    setDeps([]);
    setRelease(null);

    async function loadInstallInfo() {
      const plan = await getInstallPlan(mod, instance, { signal: controller.signal });
      setRelease(plan.release);
      setResolvedMod(plan.mainMod);
      setDeps(plan.dependencies);
      // A required dependency that is already on disk stays unchecked — nothing to
      // fetch. Fabric API pulled in by a second mod was re-downloading otherwise.
      setChecked(Object.fromEntries(
        plan.dependencies.map((dep) => [
          dep.project_id,
          dep.type === 'required' && !installedRef.current[projectKey(dep)]
        ])
      ));
      setState('ready');
    }

    loadInstallInfo().catch((error) => {
      if (error.name === 'AbortError') return;
      setErrMsg(error.message || 'Could not fetch installation details.');
      setState('error');
    });
    return () => controller.abort();
  }, [mod, instance, requestId]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const toggle = (projectId, value) =>
    setChecked((previous) => ({ ...previous, [projectId]: value }));
  const required = deps.filter((dep) => dep.type === 'required');
  const optional = deps.filter((dep) => dep.type === 'optional');
  const satisfied = deps.filter(onDisk).length;
  const selectedDeps = useMemo(
    () => deps.filter((dep) => checked[dep.project_id] && !installed[projectKey(dep)]),
    [checked, deps, installed]
  );
  const installCount = selectedDeps.length + 1;

  return (
    <div className="modal-overlay dep-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        className="modal dep-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dep-modal-title"
      >
        <header className="dep-modal-head">
          {mod.icon_url ? (
            <img className="dep-main-icon" src={mod.icon_url} alt="" />
          ) : (
            <span className="dep-main-icon dep-main-icon--fallback"><Puzzle size={23} /></span>
          )}
          <span className="dep-modal-heading">
            <small><img src={PROVIDER_ICONS[provider]} alt="" /> Install from {providerName}</small>
            <h3 id="dep-modal-title">{mod.title}</h3>
            {mod.author && <span>by {mod.author}</span>}
          </span>
          <button className="modal-close" onClick={onClose} aria-label="Close install dialog">
            <X size={17} />
          </button>
        </header>

        {mod.description && <p className="dep-description">{mod.description}</p>}

        <section className={`dep-target${compatibleTarget ? '' : ' dep-target--warning'}`}>
          <span className="dep-target-icon">
            {instance?.icon ? (
              <img src={instance.icon} alt="" />
            ) : LOADER_ICONS[instance?.loader] ? (
              <img src={LOADER_ICONS[instance.loader]} alt="" />
            ) : (
              <Gamepad2 size={19} />
            )}
          </span>
          <span className="dep-target-copy">
            <small>Installing to</small>
            <strong>{instance?.name ?? 'No instance selected'}</strong>
            <span>{instance ? `Minecraft ${instance.version} · ${instance.loader}` : 'Choose an instance first'}</span>
          </span>
          {compatibleTarget ? (
            <span className="dep-compatible"><ShieldCheck size={13} /> Compatible</span>
          ) : (
            <span className="dep-incompatible"><AlertTriangle size={13} /> Mod loader needed</span>
          )}
        </section>

        <div className="dep-modal-content">
          {state === 'loading' && (
            <div className="dep-state-panel">
              <Loader2 size={19} className="spin" />
              <span><strong>Checking compatible files</strong><small>Reading release and dependency information…</small></span>
            </div>
          )}

          {state === 'error' && (
            <div className="dep-state-panel dep-state-panel--error">
              <AlertTriangle size={19} />
              <span><strong>Can’t prepare this install</strong><small>{errMsg}</small></span>
              <button onClick={() => setRequestId((value) => value + 1)}>
                <RotateCw size={12} /> Retry
              </button>
            </div>
          )}

          {state === 'ready' && release && (
            <>
              <section className="dep-release">
                <div className="dep-section-heading">
                  <span><PackageCheck size={14} /> Compatible release</span>
                  <small>{formatDate(release.published)}</small>
                </div>
                <div className="dep-release-grid">
                  <span><small>Version</small><strong>{release.number || release.name}</strong></span>
                  <span><small>Channel</small><strong className="dep-capitalize">{release.channel || 'release'}</strong></span>
                  <span><small>Download</small><strong>{formatBytes(release.file?.size)}</strong></span>
                </div>
                {release.file && (
                  <div className="dep-file" title={release.file.filename}>
                    <HardDrive size={13} /> <span>{release.file.filename}</span>
                    <Check size={13} />
                  </div>
                )}
              </section>

              <section className="dep-dependencies">
                <div className="dep-section-heading">
                  <span><Puzzle size={14} /> Dependencies</span>
                  <small>
                    {deps.length
                      ? `${required.length} required · ${optional.length} optional` +
                        (satisfied ? ` · ${satisfied} already installed` : '')
                      : 'None required'}
                  </small>
                </div>

                {deps.length === 0 ? (
                  <div className="dep-none">
                    <Check size={15} /> No additional mods are needed for this release.
                  </div>
                ) : (
                  <div className="dep-list">
                    {required.map((dep) => (
                      <DepRow
                        key={dep.project_id}
                        dep={dep}
                        checked={!onDisk(dep)}
                        disabled
                        installed={onDisk(dep)}
                        onChange={toggle}
                      />
                    ))}
                    {optional.map((dep) => (
                      <DepRow
                        key={dep.project_id}
                        dep={dep}
                        checked={onDisk(dep) ? false : checked[dep.project_id] ?? false}
                        disabled={onDisk(dep)}
                        installed={onDisk(dep)}
                        onChange={toggle}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="dep-modal-footer">
          <span className="dep-install-summary">
            <Download size={13} />
            {state === 'ready'
              ? `${installCount} mod${installCount === 1 ? '' : 's'} will be installed into the instance mods folder.`
              : 'Nothing will be changed until you confirm.'}
          </span>
          <div className="modal-actions">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              variant="accent"
              disabled={state !== 'ready' || !compatibleTarget}
              onClick={() => onConfirm(selectedDeps, resolvedMod)}
            >
              <Download size={14} /> Install {installCount === 1 ? 'mod' : `${installCount} mods`}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
