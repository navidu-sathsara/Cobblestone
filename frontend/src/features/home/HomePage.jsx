import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { bridge } from '../../lib/bridge.js';
import { DISCORD_INVITE, NEWS, PARTNERED_SERVERS, WEBSTORE } from './data.js';
import {
  useAccounts, useBackendVersion, useGameSession, useLaunchTarget, useServerStatus, useUpdater,
} from './hooks.js';
import ContentPage from './ContentPage.jsx';
import HeroPanel from './HeroPanel.jsx';
import InstanceShelf from './InstanceShelf.jsx';
import InstancesPage from './InstancesPage.jsx';
import NewsSection from './NewsSection.jsx';
import RightRail from './RightRail.jsx';
import SideRail from './SideRail.jsx';
import TitleBar from './TitleBar.jsx';
import './HomePage.css';

const SECTION_LABELS = {
  settings: 'Settings',
};

export default function HomePage() {
  const [notice, setNotice] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('play');
  const onError = useCallback((message) => setNotice(message), []);

  const version = useBackendVersion();
  const updater = useUpdater(onError);
  const { accounts, active, login, setActive, addOffline, loginMicrosoft } = useAccounts(onError);
  const { instance, instances, select, refresh, createDefault, creating } = useLaunchTarget(onError);
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
    if (['play', 'instances', 'content'].includes(id)) {
      setActiveSection(id);
      return;
    }
    if (id === 'partners') {
      setActiveSection('play');
      return;
    }
    if (id === 'store') {
      openExternal(WEBSTORE.url);
      return;
    }
    onError(`${SECTION_LABELS[id] || id} is not available yet`);
  }, [onError, openExternal]);

  return (
    <div className="app" data-testid="home-page">
      <div className="app-grain" aria-hidden="true" />

      <TitleBar
        accounts={accounts}
        active={active}
        session={session}
        instance={instance}
        updater={updater}
        accountOpen={accountOpen}
        onAccountOpenChange={setAccountOpen}
        login={login}
        onSelect={setActive}
        onAddOffline={addOffline}
        onLoginMicrosoft={loginMicrosoft}
      />

      <div className={`app-body${activeSection === 'play' ? '' : ' app-body--workspace'}`}>
        <SideRail active={activeSection} onNavigate={navigate} version={version} />

        {activeSection === 'play' ? (
          <main className="main scroll-thin">
            <HeroPanel
              username={active?.username}
              accountType={active?.type}
              instance={instance}
              instances={instances}
              session={session}
              onSelectInstance={select}
              onCreateDefault={createDefault}
              creating={creating}
              onRequireAccount={() => setAccountOpen(true)}
            />

            <InstanceShelf
              instances={instances}
              activeId={instance?.id ?? null}
              onSelect={select}
              onCreate={createDefault}
            />

            <div className="main-bottom">
              <NewsSection items={NEWS} onOpen={openExternal} />
            </div>
          </main>
        ) : null}

        {activeSection === 'instances' ? (
          <InstancesPage
            instances={instances}
            instance={instance}
            session={session}
            onSelect={select}
            onRefresh={refresh}
            onError={onError}
            onOpenContent={() => setActiveSection('content')}
          />
        ) : null}

        {activeSection === 'content' ? (
          <ContentPage
            instances={instances}
            instance={instance}
            onSelect={select}
            onRefreshInstances={refresh}
            onError={onError}
          />
        ) : null}

        {activeSection === 'play' ? (
          <RightRail
            discord={DISCORD_INVITE}
            webstore={WEBSTORE}
            servers={PARTNERED_SERVERS}
            statuses={serverStatuses}
            onOpenExternal={openExternal}
            onJoinServer={joinServer}
          />
        ) : null}
      </div>

      {notice ? (
        <div className="notice" role="status" data-testid="notice">
          <CircleAlert size={15} strokeWidth={2.3} />
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
