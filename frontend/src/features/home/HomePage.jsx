import { useCallback, useState } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { bridge } from '../../lib/bridge.js';
import { DISCORD_INVITE, FRIENDS, NEWS, PARTNERED_SERVERS, WEBSTORE } from './data.js';
import { useAccounts, useBackendVersion, useGameSession, useLaunchTarget, useServerStatus } from './hooks.js';
import FriendsPanel from './FriendsPanel.jsx';
import HeroPanel from './HeroPanel.jsx';
import NewsSection from './NewsSection.jsx';
import RightRail from './RightRail.jsx';
import SideRail from './SideRail.jsx';
import TitleBar from './TitleBar.jsx';
import './HomePage.css';

const SECTION_LABELS = {
  profiles: 'Profiles',
  partners: 'Partners',
  store: 'Store',
  settings: 'Settings',
};

export default function HomePage() {
  const [notice, setNotice] = useState(null);
  const onError = useCallback((message) => setNotice(message), []);

  const version = useBackendVersion();
  const { accounts, active, setActive, addOffline, loginMicrosoft } = useAccounts(onError);
  const { instance, instances, select, createDefault } = useLaunchTarget(onError);
  const session = useGameSession(instance?.id ?? null, onError);
  const serverStatuses = useServerStatus(PARTNERED_SERVERS);

  const openExternal = useCallback((url) => {
    bridge.openExternal(url).catch(() => onError('That link could not be opened'));
  }, [onError]);

  /** Partnered-server rows quick-connect the active instance to that address. */
  const joinServer = useCallback((address) => {
    if (!instance) {
      onError('Create an instance before joining a server');
      return;
    }
    session.launch({ server: address });
  }, [instance, session, onError]);

  const navigate = useCallback((id) => {
    if (id !== 'play') onError(`${SECTION_LABELS[id]} is not part of the home page yet`);
  }, [onError]);

  return (
    <div className="app">
      <TitleBar
        accounts={accounts}
        active={active}
        onSelect={setActive}
        onAddOffline={addOffline}
        onLoginMicrosoft={loginMicrosoft}
      />

      <div className="app-body">
        <SideRail active="play" onNavigate={navigate} version={version} />

        <main className="main">
          <HeroPanel
            username={active?.username}
            instance={instance}
            instances={instances}
            session={session}
            onSelectInstance={select}
            onCreateDefault={createDefault}
          />

          <div className="main-bottom">
            <NewsSection items={NEWS} onOpen={openExternal} />
            <FriendsPanel
              friends={FRIENDS}
              onViewMore={() => onError('Friends is presentation-only: the launcher core has no social service')}
            />
          </div>
        </main>

        <RightRail
          discord={DISCORD_INVITE}
          webstore={WEBSTORE}
          servers={PARTNERED_SERVERS}
          statuses={serverStatuses}
          onOpenExternal={openExternal}
          onJoinServer={joinServer}
        />
      </div>

      {notice ? (
        <div className="notice" role="status">
          <CircleAlert size={15} strokeWidth={2.3} />
          <span className="notice-text">{notice}</span>
          <button type="button" className="notice-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X size={13} strokeWidth={2.6} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
