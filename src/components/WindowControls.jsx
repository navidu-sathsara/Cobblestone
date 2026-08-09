import { Minus, Square, Copy, X } from 'lucide-react';
import './WindowControls.css';

export default function WindowControls({ isMaximized = false }) {
  return (
    <div className="window-controls">
      <button
        className="icon-btn"
        title="Minimize"
        onClick={() => window.native?.minimize()}
      >
        <Minus size={16} />
      </button>
      <button
        className="icon-btn"
        title={isMaximized ? 'Restore' : 'Maximize'}
        onClick={() => window.native?.maximize()}
      >
        {isMaximized ? <Copy size={14} /> : <Square size={14} />}
      </button>
      <button
        className="icon-btn wc-close"
        title="Close"
        onClick={() => window.native?.close()}
      >
        <X size={16} />
      </button>
    </div>
  );
}
