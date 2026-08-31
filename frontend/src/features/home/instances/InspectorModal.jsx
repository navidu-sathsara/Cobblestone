import { useCallback, useEffect, useState } from 'react';
import { Archive, FileText, LoaderCircle, Map, RotateCcw, Siren, X } from 'lucide-react';
import { bridge } from '../../../lib/bridge.js';
import { formatRelative } from '../../../lib/format.js';

const KINDS = {
  worlds: { title: 'Worlds', Icon: Map, load: (id) => bridge.instances.worlds(id) },
  logs: { title: 'Latest log', Icon: FileText, load: (id) => bridge.instances.readLog(id, { lines: 800 }) },
  backups: { title: 'Backups', Icon: Archive, load: (id) => bridge.backups.list(id) },
  crashes: { title: 'Crash reports', Icon: Siren, load: (id) => bridge.instances.crashReports(id) },
};

const megabytes = (bytes) => (bytes ? `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB` : 'Size unavailable');

/** Read-only inspectors for a single instance: worlds, log, backups, crashes. */
export default function InspectorModal({ instance, kind, busy, operate, session, onError, onClose }) {
  const [data, setData] = useState(null);
  const config = KINDS[kind];

  const load = useCallback(() => {
    setData(null);
    config.load(instance.id)
      .then((value) => setData(value ?? (kind === 'logs' ? '' : [])))
      .catch((error) => { onError(error.message); onClose(); });
  }, [config, instance.id, kind, onClose, onError]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = Array.isArray(data) ? data : [];

  return (
    <div className="ui-modal-backdrop" data-testid="inspector-modal">
      <section
        className="ui-modal ui-modal--xl"
        role="dialog"
        aria-modal="true"
        aria-label={`${config.title} for ${instance.name}`}
      >
        <header className="ui-modal-head">
          <span>
            <small>{instance.name}</small>
            <strong>{config.title}</strong>
          </span>
          <button
            type="button"
            className="ui-modal-close"
            aria-label="Close"
            data-testid="inspector-close"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="ui-modal-body">
          {data === null ? (
            <div className="ui-empty ui-empty--compact">
              <LoaderCircle className="ui-spin" size={22} />
              <strong>Loading…</strong>
            </div>
          ) : null}

          {kind === 'logs' && data !== null ? (
            <pre className="ui-log" data-testid="inspector-log">
              {data || 'No latest.log has been created yet.'}
            </pre>
          ) : null}

          {kind === 'backups' && data !== null ? (
            <button
              type="button"
              className="ui-btn ui-btn--primary inspector-create"
              disabled={Boolean(busy)}
              data-testid="inspector-backup-create"
              onClick={async () => {
                const created = await operate(
                  'backup',
                  () => bridge.backups.create(instance.id, { kind: 'full', reason: 'manual' }),
                );
                if (created) load();
              }}
            >
              {busy === 'backup' ? <LoaderCircle className="ui-spin" size={14} /> : <Archive size={15} />}
              Create full backup
            </button>
          ) : null}

          {kind === 'worlds' ? list.map((world) => (
            <div className="ui-row" key={world.name} data-testid={`inspector-world-${world.name}`}>
              <Map size={16} />
              <span>
                <strong>{world.name}</strong>
                <small>{megabytes(world.size)} · modified {formatRelative(world.modifiedAt) || 'unknown'}</small>
              </span>
            </div>
          )) : null}

          {kind === 'backups' ? list.map((backup) => (
            <div className="ui-row" key={backup.filename} data-testid={`inspector-backup-${backup.filename}`}>
              <Archive size={16} />
              <span>
                <strong>{formatRelative(backup.createdAt) || 'Backup'}</strong>
                <small>{megabytes(backup.bytes)} · {backup.filename}</small>
              </span>
              <button
                type="button"
                className="ui-btn ui-btn--secondary ui-btn--sm"
                disabled={Boolean(busy) || session.running}
                data-testid={`inspector-backup-restore-${backup.filename}`}
                onClick={() => operate(
                  'restore-backup',
                  () => bridge.backups.restore(backup.filename, { targetInstanceId: instance.id }),
                )}
              >
                {busy === 'restore-backup' ? <LoaderCircle className="ui-spin" size={14} /> : <RotateCcw size={14} />}
                Restore
              </button>
            </div>
          )) : null}

          {kind === 'crashes' ? list.map((report) => (
            <div className="ui-row" key={report.name || report.filename}>
              <Siren size={16} />
              <span>
                <strong>{report.name || report.filename}</strong>
                <small>{formatRelative(report.modifiedAt || report.createdAt) || 'Unknown time'}</small>
              </span>
            </div>
          )) : null}

          {data !== null && kind !== 'logs' && !list.length ? (
            <div className="ui-empty ui-empty--compact" data-testid="inspector-empty">
              <config.Icon size={22} />
              <strong>Nothing to show yet</strong>
              <small>{config.title} will appear here once the game creates them.</small>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
