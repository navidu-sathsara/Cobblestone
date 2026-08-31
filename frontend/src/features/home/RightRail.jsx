import { useState } from 'react';
import { Coins, MessagesSquare, Play, Server, ShoppingCart } from 'lucide-react';
import { formatCompact, serverIconUrl } from '../../lib/format.js';
import './RightRail.css';

function PromoCard({ variant, Icon, Watermark, title, subtitle, action, onOpen, testId }) {
  return (
    <button type="button" className={`promo promo--${variant}`} data-testid={testId} onClick={onOpen}>
      <Watermark className="promo-watermark" size={92} strokeWidth={1.5} aria-hidden="true" />
      <span className="promo-badge">
        <Icon size={16} strokeWidth={2.4} />
      </span>
      <span className="promo-text">
        <span className="promo-title">{title}</span>
        <span className="promo-subtitle">{subtitle}</span>
      </span>
      <span className="promo-action">{action}</span>
    </button>
  );
}

function ServerIcon({ server, favicon }) {
  // Prefer the icon the server itself returned in its status ping; fall back to
  // a public icon service, then to a glyph.
  const [stage, setStage] = useState(0);
  const source = favicon || (stage === 0 ? serverIconUrl(server.address) : null);

  if (!source || stage > 1) {
    return (
      <span className="server-icon server-icon--fallback" style={{ background: server.accent }}>
        <Server size={15} strokeWidth={2.3} />
      </span>
    );
  }

  return (
    <img
      className="server-icon"
      src={source}
      alt=""
      style={{ background: server.accent }}
      onError={() => setStage((value) => value + 2)}
    />
  );
}

function ServerRow({ server, status, onJoin, index }) {
  const online = status?.online === true;
  const players = online ? status.players?.online : null;

  return (
    <li>
      <button
        type="button"
        className="server-row"
        data-testid={`server-row-${server.id}`}
        style={{ animationDelay: `${index * 45}ms` }}
        onClick={() => onJoin(server.address)}
        title={online ? `Join ${server.name}` : `${server.name} is unreachable`}
      >
        <span className="server-accent" style={{ background: server.accent }} aria-hidden="true" />
        <ServerIcon server={server} favicon={status?.favicon} />
        <span className="server-text">
          <span className="server-name">{server.name}</span>
          <span className="server-address">{server.address}</span>
        </span>
        <span className="server-meta">
          <span className="server-count">{status ? formatCompact(players) : '···'}</span>
          <span className={`dot${online ? ' dot--online' : ''}`} />
        </span>
        <span className="server-join" aria-hidden="true">
          <Play size={11} strokeWidth={3} />
        </span>
      </button>
    </li>
  );
}

export default function RightRail({ discord, webstore, servers, statuses, onOpenExternal, onJoinServer }) {
  return (
    <aside className="aside scroll-thin" aria-label="Community" data-testid="right-rail">
      <PromoCard
        variant="discord"
        Icon={MessagesSquare}
        Watermark={MessagesSquare}
        title="Community"
        subtitle={discord.label}
        action="Join"
        testId="promo-discord"
        onOpen={() => onOpenExternal(discord.url)}
      />
      <PromoCard
        variant="store"
        Icon={ShoppingCart}
        Watermark={Coins}
        title="Webstore"
        subtitle={webstore.label}
        action="Visit"
        testId="promo-store"
        onOpen={() => onOpenExternal(webstore.url)}
      />

      <h2 className="eyebrow eyebrow--muted aside-heading">Partnered Servers</h2>

      <ul className="server-list">
        {servers.map((server, index) => (
          <ServerRow
            key={server.id}
            server={server}
            status={statuses[server.id]}
            onJoin={onJoinServer}
            index={index}
          />
        ))}
      </ul>

      <span className="aside-foot">Click a server to launch straight into it</span>
    </aside>
  );
}
