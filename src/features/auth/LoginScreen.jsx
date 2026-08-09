import { useState } from 'react';
import { Zap, Puzzle, Layers, Loader2 } from 'lucide-react';
import WindowControls from '../../components/WindowControls.jsx';
import Button from '../../components/ui/Button.jsx';
import appIcon from '../../../icon.png';
import sideArt from '../../assets/login-side.jpg';
import './LoginScreen.css';

const MODS = ['Skyblock Addons', 'CPS Mod', 'Freelook', 'Zoom Mod', 'Armor Status'];
const VERSIONS = ['1.8', '1.16', '1.21', '1.20', '1.19'];

function MicrosoftLogo() {
  return (
    <span className="ms-logo" aria-hidden>
      <i style={{ background: '#f25022' }} />
      <i style={{ background: '#7fba00' }} />
      <i style={{ background: '#00a4ef' }} />
      <i style={{ background: '#ffb900' }} />
    </span>
  );
}

export default function LoginScreen({ isMaximized = false, onLogin = () => {} }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const microsoftLogin = async () => {
    if (!window.native?.auth) {
      // browser preview — no real auth available
      onLogin({ name: 'Steve', uuid: null, isMicrosoft: false });
      return;
    }
    setBusy(true);
    setError('');
    const res = await window.native.auth.login();
    setBusy(false);
    if (res.ok) {
      onLogin({ ...res.profile, isMicrosoft: true });
    } else if (!/cancelled|closed/i.test(res.error)) {
      setError(res.error);
    }
  };

  return (
    <div className="login">
      {/* left: key art */}
      <section className="login-art">
        <img src={sideArt} alt="" />
        <div className="login-art-fade" />
      </section>

      {/* right: panel */}
      <section className="login-panel">
        <div className="login-glow login-glow-a" />
        <div className="login-glow login-glow-b" />
        <div className="login-cube login-cube-a" />

        <header className="login-topbar">
          <WindowControls isMaximized={isMaximized} />
        </header>

        <div className="brand">
          <img className="brand-icon" src={appIcon} alt="" />
          <h1 className="brand-name">NATIVE</h1>
        </div>

        <div className="features">
          <div className="feature">
            <div className="feature-text">
              <h3>
                <Zap size={14} className="feature-icon" /> Boosted Frames
              </h3>
              <p>Best-in-class performance on any hardware</p>
            </div>
            <div className="feature-visual">
              <div className="fps-bar fps-native"><span>400+ FPS</span></div>
              <div className="fps-bar fps-mid"><span>150 FPS</span></div>
              <div className="fps-bar fps-low"><span>100 FPS</span></div>
            </div>
          </div>

          <div className="feature">
            <div className="feature-text">
              <h3>
                <Puzzle size={14} className="feature-icon" /> Countless Mods
              </h3>
              <p>All of your favourite mods in one easy-to-use interface</p>
            </div>
            <div className="feature-visual chips">
              {MODS.map((mod) => (
                <span key={mod} className="chip">{mod}</span>
              ))}
              <span className="chip chip-more">+ 100's more</span>
            </div>
          </div>

          <div className="feature">
            <div className="feature-text">
              <h3>
                <Layers size={14} className="feature-icon" /> Multi Version
              </h3>
              <p>Supporting all the latest versions of Minecraft: Java Edition</p>
            </div>
            <div className="feature-visual versions">
              {VERSIONS.map((v) => (
                <span key={v} className={`ver ${v === '1.21' ? 'ver-big' : ''}`}>{v}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="actions">
          <Button variant="microsoft" disabled={busy} onClick={microsoftLogin}>
            {busy ? (
              <>
                <Loader2 size={16} className="spin" /> Waiting for Microsoft…
              </>
            ) : (
              <>
                <MicrosoftLogo />
                Login with Microsoft Account
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onLogin({ name: 'Guest', uuid: null, isMicrosoft: false })}
          >
            Continue as Guest
          </Button>
          {error && <p className="login-error">{error}</p>}
        </div>

        <footer className="login-footer">© 2026 Native</footer>
      </section>
    </div>
  );
}
