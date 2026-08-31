import { useEffect } from 'react';
import { LoaderCircle, RotateCcw, Trash2, X } from 'lucide-react';
import { formatBuild, formatRelative } from '../../../lib/format.js';

export default function TrashModal({ deleted, busy, onClose, onRestore }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="ui-modal-backdrop" data-testid="trash-modal">
      <section className="ui-modal ui-modal--wide" role="dialog" aria-modal="true" aria-label="Deleted instances">
        <header className="ui-modal-head">
          <span>
            <small>Recoverable storage</small>
            <strong>Instance trash</strong>
          </span>
          <button
            type="button"
            className="ui-modal-close"
            aria-label="Close"
            data-testid="trash-modal-close"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="ui-modal-body">
          {deleted.map((record) => (
            <div className="ui-row" key={record.instance.id} data-testid={`trash-row-${record.instance.id}`}>
              <Trash2 size={16} />
              <span>
                <strong>{record.instance.name}</strong>
                <small>{formatBuild(record.instance)} · deleted {formatRelative(record.deletedAt) || 'recently'}</small>
              </span>
              <button
                type="button"
                className="ui-btn ui-btn--secondary ui-btn--sm"
                disabled={Boolean(busy)}
                data-testid={`trash-restore-${record.instance.id}`}
                onClick={() => onRestore(record.instance.id)}
              >
                {busy === 'restore' ? <LoaderCircle className="ui-spin" size={14} /> : <RotateCcw size={14} />} Restore
              </button>
            </div>
          ))}

          {!deleted.length ? (
            <div className="ui-empty ui-empty--compact" data-testid="trash-empty">
              <Trash2 size={22} />
              <strong>Trash is empty</strong>
              <small>Deleted instances will appear here.</small>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
