import { useCallback, useEffect, useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { bridge } from '../../lib/bridge.js';
import { DISCORD_INVITE, FRIENDS, NEWS, PARTNERED_SERVERS, WEBSTORE } from './data.js';
import { useAccounts, useBackendVersion, useGameSession, useLaunchTarget, useServerStatus } from './hooks.js';
import FriendsPanel from './FriendsPanel.jsx';
import HeroPanel from './HeroPanel.jsx';
import InstanceShelf from './InstanceShelf.jsx';
import NewsSection from './NewsSection.jsx';
import RightRail from './RightRail.jsx';
import SideRail from './SideRail.jsx';
import TitleBar from './TitleBar.jsx';
import './HomePage.css';

const SECTION_LABELS = {
  profiles: 'Profiles',
  content: 'Content',
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

  /* The shell has one screen, so notices are transient rather than a log. */
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

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
    <div className="app" data-testid="home-page">
      <div className="app-grain" aria-hidden="true" />

      <TitleBar
        accounts={accounts}
        active={active}
        session={session}
        instance={instance}
        onSelect={setActive}
        onAddOffline={addOffline}
        onLoginMicrosoft={loginMicrosoft}
      />

      <div className="app-body">
        <SideRail active="play" onNavigate={navigate} version={version} />

        <main className="main scroll-thin">
          <HeroPanel
            username={active?.username}
            accountType={active?.type}
            instance={instance}
            instances={instances}
            session={session}
            onSelectInstance={select}
            onCreateDefault={createDefault}
          />

          <InstanceShelf
            instances={instances}
            activeId={instance?.id ?? null}
            onSelect={select}
            onCreate={createDefault}
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
        <div className="notice" role="status" data-testid="notice">
          <TriangleAlert size={15} strokeWidth={2.3} />
          <span className="notice-text">{notice}</span>
          <button
            type="button"
            className="notice-close"
            aria-label="Dismiss"
            data-testid="notice-dismiss"
            onClick={() => setNotice(null)}
          >
            <X size={13} strokeWidth={2.6} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
