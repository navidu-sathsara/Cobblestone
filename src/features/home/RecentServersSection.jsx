import { useCallback, useEffect, useState } from 'react';
import { Clock3, RefreshCw, Server, Users, Signal, Loader2 } from 'lucide-react';
import { timeAgo } from '../../lib/time.js';
import './RecentServersSection.css';

function pingClass(latency) {
  if (latency == null) return '';
  if (latency < 120) return 'ping-good';
  if (latency < 300) return 'ping-ok';
  return 'ping-bad';
}

export default function RecentServersSection() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState({}); // address -> { loading, ...ping }

  const pingAll = useCallback((list) => {
    const api = window.native?.server;
    if (!api?.ping) return;
    setStatuses(Object.fromEntries(list.map((s) => [s.address.toLowerCase(), { loading: true }])));
    for (const server of list) {
      const key = server.address.toLowerCase();
      api.ping(server.address)
        .then((res) => setStatuses((prev) => ({ ...prev, [key]: { loading: false, ...res } })))
        .catch(() => setStatuses((prev) => ({ ...prev, [key]: { loading: false, online: false } })));
    }
  }, []);

  const load = useCallback(async () => {
    const api = window.native?.instance;
    if (!api?.recentServers) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.recentServers();
      setServers(list);
      pingAll(list);
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [pingAll]);

  useEffect(() => {
    load();
    const off = window.native?.launcher?.onState?.(({ status }) => {
      if (status === 'idle') load();
    });
    return () => off?.();
  }, [load]);

  return (
    <section className="recent-servers" data-testid="recent-servers">
      <div className="section-head">
        <h2>Recent Servers</h2>
        <button className="section-link recent-refresh" onClick={load} disabled={loading} data-testid="recent-refresh">
          <RefreshCw size={11} className={loading ? 'is-spinning' : ''} /> Refresh
        </button>
      </div>

      {servers.length ? (
        <div className="recent-server-list">
          {servers.map((server) => {
            const status = statuses[server.address.toLowerCase()] ?? { loading: true };
            const online = status.online;
            return (
              <div className="recent-server" key={server.address.toLowerCase()} data-testid="recent-server-card">
                <span className={`recent-server-icon${online === false ? ' is-offline' : ''}`}>
                  {status.favicon
                    ? <img src={status.favicon} alt="" className="recent-server-favicon" />
                    : <Server size={18} />}
                </span>

                <div className="recent-server-main">
                  <div className="recent-server-top">
                    <strong className="recent-server-addr" title={server.address}>{server.address}</strong>
                    {status.loading ? (
                      <span className="recent-ping is-loading"><Loader2 size={10} className="spin" /></span>
                    ) : online ? (
                      <span className={`recent-ping ${pingClass(status.latency)}`} title="Ping">
                        <Signal size={11} /> {status.latency}ms
                      </span>
                    ) : (
                      <span className="recent-ping ping-bad" title="Server offline">
                        <Signal size={11} /> Offline
                      </span>
                    )}
                  </div>

                  <div className="recent-server-bottom">
                    <small className="recent-server-motd" title={online ? status.motd : undefined}>
                      {status.loading
                        ? 'Pinging server…'
                        : online
                          ? (status.motd || server.instanceName)
                          : `via ${server.instanceName}`}
                    </small>
                    {online && (
                      <span className="recent-stat" title="Players online">
                        <Users size={11} /> {status.players?.online ?? 0}
                        <em>/{status.players?.max ?? 0}</em>
                      </span>
                    )}
                    <span className="recent-server-time" title={new Date(server.connectedAt).toLocaleString()}>
                      <Clock3 size={10} /> {timeAgo(server.connectedAt)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="recent-server-empty">
          <Server size={22} />
          <strong>{loading ? 'Reading game logs…' : 'No multiplayer history yet'}</strong>
          <small>Servers appear here after you connect to them.</small>
        </div>
      )}
    </section>
  );
}
