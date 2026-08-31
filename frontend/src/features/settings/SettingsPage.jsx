import { useEffect, useState } from 'react';
import {
  Blocks, CircleUser, Download, FolderTree, Gauge, Info, LoaderCircle, Lock, MemoryStick,
  Monitor, Plus, RefreshCw, RotateCcw, Trash2, UserCheck,
} from 'lucide-react';
import { bridge } from '../../lib/bridge.js';
import './SettingsPage.css';

const yesNo = (value) => (value ? 'On' : 'Off');

function Panel({ title, hint, Icon, children, testId }) {
  return (
    <section className="set-panel" data-testid={testId}>
      <header>
        <span className="set-panel-glyph"><Icon size={16} /></span>
        <span>
          <h2>{title}</h2>
          <small>{hint}</small>
        </span>
      </header>
      {children}
    </section>
  );
}

function Facts({ rows }) {
  return (
    <dl className="set-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Launcher settings and about. The backend exposes settings as read-only over
 * the bridge (`settings:get` with no setter), so this screen reports the live
 * configuration and keeps the actions that do exist: updates and accounts.
 */
export default function SettingsPage({
  accounts, active, updater, version, onSetActive, onRemoveAccount, onAddAccount, onOpenExternal, onError,
}) {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([bridge.status(), bridge.settings.get()])
      .then(([nextStatus, nextSettings]) => {
        if (cancelled) return;
        setStatus(nextStatus || null);
        setSettings(nextSettings || null);
      })
      .catch((error) => onError(error.message));
    return () => { cancelled = true; };
  }, [onError]);

  const memory = settings?.memory;
  const game = settings?.game;
  const downloads = settings?.downloads;
  const mods = settings?.mods;
  const instanceRules = settings?.instances;

  return (
    <main className="ui-page settings-page scroll-thin" data-testid="settings-page">
      <header className="ui-page-head">
        <span>
          <small>Launcher</small>
          <h1>Settings</h1>
          <p>Live configuration, sign-in profiles and update controls for this installation.</p>
        </span>
        <div className="ui-page-actions">
          <button
            type="button"
            className="ui-btn ui-btn--secondary"
            data-testid="settings-check-updates"
            onClick={() => updater.check()}
          >
            <RefreshCw size={15} /> Check for updates
          </button>
        </div>
      </header>

      <div className="set-grid">
        <Panel
          title="Accounts"
          hint="Profiles stored in the launcher's secret vault"
          Icon={CircleUser}
          testId="settings-accounts"
        >
          <div className="set-accounts">
            {accounts.map((account) => (
              <div className="ui-row" key={account.id} data-testid={`settings-account-${account.id}`}>
                <CircleUser size={16} />
                <span>
                  <strong>{account.username}</strong>
                  <small>{account.type === 'microsoft' ? 'Microsoft account' : 'Offline profile'}</small>
                </span>
                {account.id === active?.id ? (
                  <span className="ui-badge ui-badge--ok">Active</span>
                ) : (
                  <button
                    type="button"
                    className="ui-btn ui-btn--secondary ui-btn--sm"
                    data-testid={`settings-account-activate-${account.id}`}
                    onClick={() => onSetActive(account.id)}
                  >
                    <UserCheck size={13} /> Use
                  </button>
                )}
                <button
                  type="button"
                  className="ui-btn ui-btn--danger ui-btn--sm"
                  aria-label={`Remove ${account.username}`}
                  data-testid={`settings-account-remove-${account.id}`}
                  onClick={() => onRemoveAccount(account.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {!accounts.length ? (
              <div className="ui-empty ui-empty--compact">
                <CircleUser size={22} />
                <strong>No profiles yet</strong>
                <small>Sign in to keep a profile ready for the next launch.</small>
              </div>
            ) : null}
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              data-testid="settings-add-account"
              onClick={onAddAccount}
            >
              <Plus size={15} /> Add a profile
            </button>
          </div>
        </Panel>

        <Panel
          title="Updates"
          hint="Desktop auto-updater state"
          Icon={Download}
          testId="settings-updates"
        >
          <Facts rows={[
            ['Status', updater.status],
            ['Target version', updater.version],
            ['Detail', updater.message],
          ]}
          />
          {updater.status === 'downloaded' ? (
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              data-testid="settings-install-update"
              onClick={() => updater.install()}
            >
              <RotateCcw size={15} /> Restart &amp; install
            </button>
          ) : null}
        </Panel>

        <Panel
          title="Installation"
          hint="Where this launcher keeps its data"
          Icon={FolderTree}
          testId="settings-installation"
        >
          {status ? (
            <Facts rows={[
              ['Launcher', `${status.name} ${version ? `v${version}` : ''}`.trim()],
              ['Data directory', status.dataDirectory],
              ['Instances', status.instances],
              ['Content providers', (status.providers || []).join(', ')],
              ['Running games', (status.runningGames || []).length],
            ]}
            />
          ) : (
            <span className="set-loading"><LoaderCircle className="ui-spin" size={16} /> Reading launcher status…</span>
          )}
        </Panel>

        <Panel
          title="Memory &amp; Java"
          hint="Applied to every launch unless an instance overrides it"
          Icon={MemoryStick}
          testId="settings-memory"
        >
          {memory ? (
            <Facts rows={[
              ['Minimum heap', `${memory.minimumMb} MB`],
              ['Maximum heap', `${memory.maximumMb} MB`],
              ['Auto adjust', yesNo(memory.autoAdjust)],
              ['Managed Java runtimes', yesNo(settings?.java?.autoManage)],
            ]}
            />
          ) : null}
        </Panel>

        <Panel
          title="Game window"
          hint="Default resolution and launch arguments"
          Icon={Monitor}
          testId="settings-game"
        >
          {game ? (
            <Facts rows={[
              ['Resolution', `${game.width} × ${game.height}`],
              ['Fullscreen', yesNo(game.fullscreen)],
              ['JVM arguments', game.jvmArguments?.length ? game.jvmArguments.join(' ') : 'None'],
              ['Game arguments', game.gameArguments?.length ? game.gameArguments.join(' ') : 'None'],
            ]}
            />
          ) : null}
        </Panel>

        <Panel
          title="Downloads"
          hint="Transfer behaviour for game and content files"
          Icon={Gauge}
          testId="settings-downloads"
        >
          {downloads ? (
            <Facts rows={[
              ['Concurrency', `${downloads.concurrency} parallel`],
              ['Retries', downloads.retries],
              ['Timeout', `${Math.round(downloads.timeoutMs / 1000)} s`],
              ['Allow insecure HTTP', yesNo(downloads.allowInsecureHttp)],
            ]}
            />
          ) : null}
        </Panel>

        <Panel
          title="Content rules"
          hint="How mods and instances are kept up to date"
          Icon={Blocks}
          testId="settings-content-rules"
        >
          {mods ? (
            <Facts rows={[
              ['Preferred provider', mods.preferredProvider],
              ['Release channels', (mods.releaseChannels || []).join(', ')],
              ['Install dependencies', yesNo(mods.installRequiredDependencies)],
              ['Backup before updates', yesNo(instanceRules?.autoBackupBeforeUpdates)],
              ['Backup retention', instanceRules?.backupRetention],
            ]}
            />
          ) : null}
        </Panel>

        <Panel
          title="About"
          hint="Links and credits"
          Icon={Info}
          testId="settings-about"
        >
          <div className="set-links">
            <button type="button" data-testid="settings-link-discord" onClick={() => onOpenExternal('https://discord.gg/cobblestone')}>
              Community Discord
            </button>
            <button type="button" data-testid="settings-link-store" onClick={() => onOpenExternal('https://cobblestone.net/store')}>
              Webstore
            </button>
            <button type="button" data-testid="settings-link-modrinth" onClick={() => onOpenExternal('https://modrinth.com')}>
              Modrinth
            </button>
          </div>
          <p className="set-note">
            <Lock size={13} /> Configuration is written by the launcher core to
            <code> settings.json</code> and exposed to this window read-only.
          </p>
        </Panel>
      </div>
    </main>
  );
}
