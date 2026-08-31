import { useState } from 'react';
import {
  Coins, Gauge, MessagesSquare, Play, RefreshCw, Server, ShoppingCart, Users, Wifi, WifiOff,
} from 'lucide-react';
import { formatCompact, formatCount, serverIconUrl } from '../../lib/format.js';
import './PartnersPage.css';

function ServerIcon({ server, favicon }) {
  const [stage, setStage] = useState(0);
  const source = favicon || (stage === 0 ? serverIconUrl(server.address) : null);

  if (!source || stage > 1) {
    return (
      <span className="partner-icon partner-icon--fallback" style={{ background: server.accent }}>
        <Server size={22} strokeWidth={2.2} />
      </span>
    );
  }

  return (
    <img
      className="partner-icon"
      src={source}
      alt=""
      style={{ background: server.accent }}
      onError={() => setStage((value) => value + 2)}
    />
  );
}

function PartnerCard({ server, status, canJoin, onJoin, index }) {
  const online = status?.online === true;
  const pending = !status;

  return (
    <article
      className={`partner-card${online ? ' partner-card--online' : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      data-testid={`partner-card-${server.id}`}
    >
      <span className="partner-accent" style={{ background: server.accent }} aria-hidden="true" />

      <header className="partner-head">
        <ServerIcon server={server} favicon={status?.favicon} />
        <span className="partner-title">
          <strong>{server.name}</strong>
          <small>{server.address}</small>
        </span>
        <span className={`partner-state partner-state--${pending ? 'pending' : online ? 'online' : 'offline'}`}>
          {pending ? <Wifi size={13} /> : online ? <Wifi size={13} /> : <WifiOff size={13} />}
          {pending ? 'Pinging' : online ? 'Online' : 'Unreachable'}
        </span>
      </header>

      <dl className="partner-stats">
        <div>
          <dt><Users size={13} /> Players</dt>
          <dd data-testid={`partner-players-${server.id}`}>
            {online ? formatCount(status.players?.online) : '—'}
            {online && status.players?.max ? <em> / {formatCompact(status.players.max)}</em> : null}
          </dd>
        </div>
        <div>
          <dt><Gauge size={13} /> Latency</dt>
          <dd>{online && Number.isFinite(status.latencyMs) ? `${status.latencyMs} ms` : '—'}</dd>
        </div>
        <div>
          <dt><Server size={13} /> Version</dt>
          <dd>{online ? status.version?.name || 'Unknown' : '—'}</dd>
        </div>
      </dl>

      <button
        type="button"
        className="ui-btn ui-btn--primary partner-join"
        disabled={!online || !canJoin}
        title={!canJoin ? 'Create an instance before joining a server' : undefined}
        data-testid={`partner-join-${server.id}`}
        onClick={() => onJoin(server.address)}
      >
        <Play size={14} fill="currentColor" />
        {online ? 'Quick connect' : 'Unavailable'}
      </button>
    </article>
  );
}

/**
 * Partnered network directory. Player counts, latency, version and icons all
 * come from the backend's native server-list ping, so nothing here is static
 * except the names, addresses and accent colours.
 */
export default function PartnersPage({
  servers, statuses, discord, webstore, instance, session, onRefresh, onJoinServer, onOpenExternal,
}) {
  const onlineCount = servers.filter((server) => statuses[server.id]?.online).length;
  const canJoin = Boolean(instance) && !session.busy && !session.running;

  return (
    <main className="ui-page partners-page scroll-thin" data-testid="partners-page">
      <header className="ui-page-head">
        <span>
          <small>Community</small>
          <h1>Partners</h1>
          <p>Networks we ship with the launcher. Quick connect launches your active instance straight into the server.</p>
        </span>
        <div className="ui-page-actions">
          <button
            type="button"
            className="ui-btn ui-btn--secondary"
            data-testid="partners-refresh"
            onClick={onRefresh}
          >
            <RefreshCw size={15} /> Re-ping all
          </button>
        </div>
      </header>

      <div className="partners-summary" data-testid="partners-summary">
        <span><strong>{onlineCount}</strong><small>Online now</small></span>
        <span><strong>{servers.length}</strong><small>Partnered networks</small></span>
        <span>
          <strong>{instance ? instance.name : 'None'}</strong>
          <small>Launch target</small>
        </span>
      </div>

      <div className="partners-grid">
        {servers.map((server, index) => (
          <PartnerCard
            key={server.id}
            server={server}
            status={statuses[server.id]}
            canJoin={canJoin}
            index={index}
            onJoin={onJoinServer}
          />
        ))}
      </div>

      <section className="partners-promos">
        <button
          type="button"
          className="partner-promo partner-promo--discord"
          data-testid="partners-discord"
          onClick={() => onOpenExternal(discord.url)}
        >
          <MessagesSquare size={20} />
          <span><strong>Join the community</strong><small>{discord.label}</small></span>
        </button>
        <button
          type="button"
          className="partner-promo partner-promo--store"
          data-testid="partners-store"
          onClick={() => onOpenExternal(webstore.url)}
        >
          <ShoppingCart size={20} />
          <span><strong>Visit the webstore</strong><small>{webstore.label}</small></span>
        </button>
        <button
          type="button"
          className="partner-promo"
          data-testid="partners-modrinth"
          onClick={() => onOpenExternal('https://modrinth.com/modpacks')}
        >
          <Coins size={20} />
          <span><strong>Browse Modrinth packs</strong><small>modrinth.com/modpacks</small></span>
        </button>
      </section>
    </main>
  );
}
