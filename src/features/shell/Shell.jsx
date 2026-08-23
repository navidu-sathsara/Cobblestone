import { useState } from 'react';
import {
  Hammer, ChevronDown, Loader2,
  Gamepad2, Boxes, Puzzle, Package, Globe, Newspaper, Settings
} from 'lucide-react';
import WindowControls from '../../components/WindowControls.jsx';
import DownloadRing from '../../components/DownloadRing.jsx';
import { useClickOutside } from '../../components/ui/Dropdown.jsx';
import appIcon from '../../../icon.png';
import BottomBar from './BottomBar.jsx';
import ProfilePanel from './ProfilePanel.jsx';
import HomePage from '../home/HomePage.jsx';
import InstancesPage from '../instances/InstancesPage.jsx';
import InstanceDetailPage from '../instances/InstanceDetailPage.jsx';
import ModsPage from '../mods/ModsPage.jsx';
import ModpacksPage from '../mods/ModpacksPage.jsx';
import ModDetailPage from '../mods/ModDetailPage.jsx';
import SettingsModal from '../settings/SettingsModal.jsx';
import useInstances from '../instances/useInstances.js';
import useLauncher, { useLauncherInstallLock } from '../launcher/useLauncher.js';
import Avatar from '../../components/ui/Avatar.jsx';
import iconHypixel    from '../../assets/servers/hypixel.png';
import iconMineplex   from '../../assets/servers/mineplex.png';
import iconTimolia    from '../../assets/servers/timolia.png';
import iconCubecraft  from '../../assets/servers/cubecraft.png';
import iconPvpland    from '../../assets/servers/pvpland.png';
import iconLemoncloud from '../../assets/servers/lemoncloud.png';
import './Shell.css';

const SERVERS = [
  { key: 'H', name: 'Hypixel',    icon: iconHypixel    },
  { key: 'M', name: 'Mineplex',   icon: iconMineplex   },
  { key: 'T', name: 'Timolia',    icon: iconTimolia    },
  { key: 'S', name: 'Cubecraft',  icon: iconCubecraft  },
  { key: 'V', name: 'PvP Land',   icon: iconPvpland    },
  { key: 'L', name: 'LemonCloud', icon: iconLemoncloud },
];

const NAV = [
  { id: 'play',      icon: Gamepad2,      label: 'Play' },
  { id: 'instances', icon: Boxes,         label: 'Instances' },
  { id: 'mods',      icon: Puzzle,        label: 'Mods' },
  { id: 'modpacks',  icon: Package,       label: 'Modpacks' },
  { id: 'servers',   icon: Globe,         label: 'Servers' },
  { id: 'news',      icon: Newspaper,     label: 'News' }
];

function ComingSoon({ label }) {
  return (
    <div className="coming-soon">
      <Hammer size={34} />
      <h2>{label}</h2>
      <p>This page is under construction.</p>
    </div>
  );
}

const PAGE_LABELS = { servers: 'Servers', news: 'News' };

function initialNav() {
  const hash = window.location.hash;
  if (hash.startsWith('#instance=')) {
    return { page: 'instance', id: decodeURIComponent(hash.slice('#instance='.length)) };
  }
  if (hash.startsWith('#instances')) return { page: 'instances' };
  if (hash.startsWith('#mod=')) {
    return { page: 'mod', id: decodeURIComponent(hash.slice('#mod='.length)) };
  }
  if (hash.startsWith('#modpacks')) return { page: 'modpacks' };
  if (hash.startsWith('#mods')) return { page: 'mods' };
  return { page: 'play' };
}

export default function Shell({
  isMaximized = false,
  account = { name: 'Guest', uuid: null, type: 'guest', isMicrosoft: false },
  accounts = [],
  activeId = null,
  onAddMicrosoft  = () => {},
  onAddNative     = () => {},
  onAddOffline    = () => {},
  onSwitchAccount = () => {},
  onRemoveAccount = () => {}
}) {
  const [nav, setNav] = useState(initialNav);
  const [pendingLaunch, setPendingLaunch] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(
    window.location.hash.startsWith('#settings')
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useClickOutside(() => setProfileOpen(false));
  const store = useInstances();
  const sidebarLocked = useLauncherInstallLock();
  const { status, percent, detail, busy } = useLauncher();

  const page = nav.page;
  const sidebarActive =
    page === 'instance' ? 'instances'
    : page === 'mod' ? 'mods'
    : page === 'modpacks' ? 'modpacks'
    : page;

  return (
    <div className="shell">

      <main className="shell-main">
        <header className="shell-top">
          <div className="shell-top-left">
            <div className="shell-logo">
              <img src={appIcon} alt="Native Logo" className="shell-logo-img" />
            </div>

            <span className="shell-nav-divider" />

            <nav className="shell-nav" data-testid="shell-nav">
              {NAV.map(({ id, icon: Icon, label }) => {
                const active = settingsOpen ? false : sidebarActive === id;
                return (
                  <button
                    key={id}
                    data-testid={`nav-${id}`}
                    className={`shell-nav-item${active ? ' active' : ''}`}
                    title={sidebarLocked ? 'Navigation locked while installing' : label}
                    disabled={sidebarLocked}
                    onClick={() => {
                      setSettingsOpen(false);
                      setNav({ page: id });
                    }}
                  >
                    <span className="shell-nav-item-inner">
                      <Icon size={15} strokeWidth={2.4} />
                      <span>{label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="shell-top-right">
            <div className="account-wrap" ref={profileRef}>
              <button className="account-chip" onClick={() => setProfileOpen((v) => !v)}>
                <Avatar
                  className="account-avatar account-avatar-img"
                  uuid={account.uuid}
                />
                <span className="account-text">
                  <small>Playing as</small>
                  <strong>{account.name.toUpperCase()}</strong>
                </span>
                <ChevronDown size={13} className="account-caret" />
              </button>

              {profileOpen && (
                <ProfilePanel
                  account={account}
                  accounts={accounts}
                  activeId={activeId}
                  onSwitchAccount={onSwitchAccount}
                  onRemoveAccount={onRemoveAccount}
                  onAddOffline={onAddOffline}
                  onAddMicrosoft={onAddMicrosoft}
                  onAddNative={onAddNative}
                  onClose={() => setProfileOpen(false)}
                />
              )}
            </div>

            {busy && (
              <div className="launcher-progress-chip" title={`${status}: ${detail}`}>
                <Loader2 size={13} className="spin launcher-progress-spin" />
                <span>{status === 'downloading' ? `${percent}%` : 'Launching'}</span>
              </div>
            )}
            <button
              className={`icon-btn${settingsOpen ? ' active' : ''}`}
              title={sidebarLocked ? 'Navigation locked while installing' : 'Settings'}
              disabled={sidebarLocked}
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <Settings size={16} />
            </button>
            <DownloadRing />
            <span className="top-divider" />
            <WindowControls isMaximized={isMaximized} />
          </div>
        </header>

        {page === 'play' ? (
          <HomePage
            store={store}
            account={account}
            onManageInstances={() => setNav({ page: 'instances' })}
            autoLaunch={pendingLaunch}
            onAutoLaunchDone={() => setPendingLaunch(false)}
          />
        ) : page === 'instances' ? (
          <InstancesPage store={store} onOpen={(id) => setNav({ page: 'instance', id })} />
        ) : page === 'instance' ? (
          <InstanceDetailPage
            store={store}
            account={account}
            instanceId={nav.id}
            onBack={() => setNav({ page: 'instances' })}
            onBrowseMods={() => setNav({ page: 'mods' })}
            onInstall={() => {
              setNav({ page: 'play' });
              setPendingLaunch(true);
            }}
          />
        ) : page === 'mods' ? (
          <ModsPage
            store={store}
            onOpenMod={(id) => setNav({ page: 'mod', id, from: 'mods' })}
            onPackInstalled={(id) => setNav({ page: 'instance', id })}
          />
        ) : page === 'modpacks' ? (
          <ModpacksPage
            store={store}
            onOpenMod={(id) => setNav({ page: 'mod', id, from: 'modpacks' })}
            onPackInstalled={(id) => setNav({ page: 'instance', id })}
          />
        ) : page === 'mod' ? (
          <ModDetailPage
            store={store}
            projectId={nav.id}
            onBack={() => setNav({ page: nav.from || 'mods' })}
            onPackInstalled={(id) => setNav({ page: 'instance', id })}
          />
        ) : (
          <ComingSoon label={PAGE_LABELS[page] ?? page} />
        )}
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <BottomBar />
    </div>
  );
}
