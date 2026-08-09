import { useState } from 'react';
import { LayoutGrid, Mail, Hammer, ChevronDown } from 'lucide-react';
import WindowControls from '../../components/WindowControls.jsx';
import DownloadRing from '../../components/DownloadRing.jsx';
import { useClickOutside } from '../../components/ui/Dropdown.jsx';
import Sidebar from './Sidebar.jsx';
import ProfilePanel from './ProfilePanel.jsx';
import HomePage from '../home/HomePage.jsx';
import InstancesPage from '../instances/InstancesPage.jsx';
import InstanceDetailPage from '../instances/InstanceDetailPage.jsx';
import ModsPage from '../mods/ModsPage.jsx';
import ModpacksPage from '../mods/ModpacksPage.jsx';
import ModDetailPage from '../mods/ModDetailPage.jsx';
import SettingsModal from '../settings/SettingsModal.jsx';
import useInstances from '../instances/useInstances.js';
import { useLauncherInstallLock } from '../launcher/useLauncher.js';
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

function ComingSoon({ label }) {
  return (
    <div className="coming-soon">
      <Hammer size={34} />
      <h2>{label}</h2>
      <p>This page is under construction.</p>
    </div>
  );
}

const PAGE_LABELS = { servers: 'Servers', news: 'News', store: 'Store' };

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

  const page = nav.page;
  const sidebarActive =
    page === 'instance' ? 'instances'
    : page === 'mod' ? 'mods'
    : page === 'modpacks' ? 'modpacks'
    : page;

  return (
    <div className="shell">
      <Sidebar
        active={settingsOpen ? 'settings' : sidebarActive}
        locked={sidebarLocked}
        onNavigate={(id) =>
          id === 'settings' ? setSettingsOpen(true) : setNav({ page: id })
        }
      />

      <main className="shell-main">
        <header className="shell-top">
          <div className="quickplay">
            <button className="quickplay-label">
              <LayoutGrid size={14} /> Quick Play
            </button>
            <div className="quickplay-servers">
              {SERVERS.map((s) => (
                <button key={s.key} className="server-tile" title={s.name}>
                  <img src={s.icon} alt={s.name} className="server-tile-icon" />
                </button>
              ))}
            </div>
          </div>

          <div className="shell-top-right">
            <div className="account-wrap" ref={profileRef}>
              <button className="account-chip" onClick={() => setProfileOpen((v) => !v)}>
                <img
                  className="account-avatar account-avatar-img"
                  src={`https://mc-heads.net/avatar/${account.uuid ?? 'MHF_Steve'}/60`}
                  alt=""
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
                  onClose={() => setProfileOpen(false)}
                />
              )}
            </div>

            <button className="icon-btn" title="Inbox">
              <Mail size={16} />
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
            onOpenMod={(id) => setNav({ page: 'mod', id })}
            onPackInstalled={(id) => setNav({ page: 'instance', id })}
          />
        ) : page === 'modpacks' ? (
          <ModpacksPage
            store={store}
            onOpenMod={(id) => setNav({ page: 'mod', id })}
            onPackInstalled={(id) => setNav({ page: 'instance', id })}
          />
        ) : page === 'mod' ? (
          <ModDetailPage
            store={store}
            projectId={nav.id}
            onBack={() => setNav({ page: 'mods' })}
            onPackInstalled={(id) => setNav({ page: 'instance', id })}
          />
        ) : (
          <ComingSoon label={PAGE_LABELS[page] ?? page} />
        )}
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
