import appIcon from '../../../icon.png';
import './BottomBar.css';

export default function BottomBar() {
  return (
    <div className="bottom-bar">
      <div className="bottom-bar-brand">
        <img src={appIcon} alt="Native" className="bottom-bar-logo" />
        {window.native?.version && (
          <span className="bottom-bar-version">v{window.native.version}</span>
        )}
      </div>
    </div>
  );
}
