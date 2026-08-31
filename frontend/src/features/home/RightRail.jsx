import { useState } from 'react';
import { Coins, MessagesSquare, Server, ShoppingCart } from 'lucide-react';
import { formatCount, serverIconUrl } from '../../lib/format.js';
import './RightRail.css';

function PromoCard({ variant, Icon, Watermark, title, subtitle, action, onOpen }) {
  return (
    <div className={`promo promo--${variant}`}>
      <Watermark className="promo-watermark" size={86} strokeWidth={1.6} aria-hidden="true" />
      <span className="promo-badge">
        <Icon size={17} strokeWidth={2.3} />
      </span>
      <span className="promo-text">
        <span className="promo-title">{title}</span>
        <span className="promo-subtitle">{subtitle}</span>
      </span>
      <button type="button" className="promo-action" onClick={onOpen}>
        {action}
      </button>
    </div>
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
        <Server size={16} strokeWidth={2.2} />
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

function ServerRow({ server, status, onJoin }) {
  const online = status?.online === true;
  const players = online ? status.players?.online : null;

  return (
    <li>
      <button
        type="button"
        className="server-row"
        onClick={() => onJoin(server.address)}
        title={online ? `Join ${server.name}` : `${server.name} is unreachable`}
      >
        <ServerIcon server={server} favicon={status?.favicon} />
        <span className="server-text">
          <span className="server-name">{server.name}</span>
          <span className="server-address">{server.address}</span>
        </span>
        <span className="server-meta">
          <span className={`dot${online ? ' dot--online' : ''}`} />
          <span className="server-count">{status ? formatCount(players) : ''}</span>
        </span>
      </button>
    </li>
  );
}

export default function RightRail({ discord, webstore, servers, statuses, onOpenExternal, onJoinServer }) {
  return (
    <aside className="aside" aria-label="Community">
      <PromoCard
        variant="discord"
        Icon={MessagesSquare}
        Watermark={MessagesSquare}
        title="Discord"
        subtitle={discord.label}
        action="Join"
        onOpen={() => onOpenExternal(discord.url)}
      />
      <PromoCard
        variant="store"
        Icon={ShoppingCart}
        Watermark={Coins}
        title="Webstore"
        subtitle={webstore.label}
        action="Visit"
        onOpen={() => onOpenExternal(webstore.url)}
      />

      <h2 className="eyebrow eyebrow--muted aside-heading">Partnered Servers</h2>

      <ul className="server-list scroll-thin">
        {servers.map((server) => (
          <ServerRow
            key={server.id}
            server={server}
            status={statuses[server.id]}
            onJoin={onJoinServer}
          />
        ))}
      </ul>
    </aside>
  );
}
