import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { bridge } from '../../lib/bridge.js';
import { useRoute } from '../../lib/use-route.js';
import { DISCORD_INVITE, NEWS, PARTNERED_SERVERS, WEBSTORE } from './data.js';
import {
  useAccounts, useBackendVersion, useGameSession, useLaunchTarget, useServerStatus, useUpdater,
} from './hooks.js';
import ContentPage from './ContentPage.jsx';
import HeroPanel from './HeroPanel.jsx';
import InstanceShelf from './InstanceShelf.jsx';
import InstancesPage from './InstancesPage.jsx';
import NewsSection from './NewsSection.jsx';
import PartnersPage from '../partners/PartnersPage.jsx';
import RightRail from './RightRail.jsx';
import SettingsPage from '../settings/SettingsPage.jsx';
import SideRail from './SideRail.jsx';
import TitleBar from './TitleBar.jsx';
import './HomePage.css';

export default function HomePage() {
  const [notice, setNotice] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [route, navigate] = useRoute();
  const onError = useCallback((message) => setNotice(message), []);

  const version = useBackendVersion();
  const updater = useUpdater(onError);
  const accountStore = useAccounts(onError);
  const { accounts, active, login, setActive, addOffline, loginMicrosoft, remove } = accountStore;
  const { instance, instances, select, refresh, createDefault, creating } = useLaunchTarget(onError);
  const session = useGameSession(instance?.id ?? null, onError);
  const { statuses, refresh: refreshServers } = useServerStatus(PARTNERED_SERVERS);

  /* Notices are transient rather than a log: the shell has no history surface. */
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

  const onNavigate = useCallback((id) => {
    if (id === 'store') {
      openExternal(WEBSTORE.url);
      return;
    }
    navigate(id);
  }, [navigate, openExternal]);

  const workspace = route !== 'play';

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

      <div className={`app-body${workspace ? ' app-body--workspace' : ''}`}>
        <SideRail active={route} onNavigate={onNavigate} version={version} />

        {route === 'play' ? (
          <main className="main scroll-thin" data-testid="play-page">
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
              onManage={() => navigate('instances')}
            />

            <div className="main-bottom">
              <NewsSection items={NEWS} onOpen={openExternal} />
            </div>
          </main>
        ) : null}

        {route === 'instances' ? (
          <InstancesPage
            instances={instances}
            instance={instance}
            session={session}
            onSelect={select}
            onRefresh={refresh}
            onError={onError}
            onOpenContent={() => navigate('content')}
          />
        ) : null}

        {route === 'content' ? (
          <ContentPage
            instances={instances}
            instance={instance}
            onSelect={select}
            onRefreshInstances={refresh}
            onError={onError}
          />
        ) : null}

        {route === 'partners' ? (
          <PartnersPage
            servers={PARTNERED_SERVERS}
            statuses={statuses}
            discord={DISCORD_INVITE}
            webstore={WEBSTORE}
            instance={instance}
            session={session}
            onRefresh={refreshServers}
            onJoinServer={joinServer}
            onOpenExternal={openExternal}
          />
        ) : null}

        {route === 'settings' ? (
          <SettingsPage
            accounts={accounts}
            active={active}
            updater={updater}
            version={version}
            onSetActive={setActive}
            onRemoveAccount={remove}
            onAddAccount={() => setAccountOpen(true)}
            onOpenExternal={openExternal}
            onError={onError}
          />
        ) : null}

        {route === 'play' ? (
          <RightRail
            discord={DISCORD_INVITE}
            webstore={WEBSTORE}
            servers={PARTNERED_SERVERS}
            statuses={statuses}
            onOpenExternal={openExternal}
            onJoinServer={joinServer}
            onSeeAll={() => navigate('partners')}
          />
        ) : null}
      </div>

      {notice ? (
        <div className="notice" role="status" aria-live="polite" data-testid="notice">
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
