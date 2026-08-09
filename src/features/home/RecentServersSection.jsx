import { useCallback, useEffect, useState } from 'react';
import { Clock3, RefreshCw, Server } from 'lucide-react';
import { timeAgo } from '../../lib/time.js';
import './RecentServersSection.css';

export default function RecentServersSection() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const api = window.native?.instance;
    if (!api?.recentServers) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setServers(await api.recentServers());
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const off = window.native?.launcher?.onState?.(({ status }) => {
      if (status === 'idle') load();
    });
    return () => off?.();
  }, [load]);

  return (
    <section className="recent-servers">
      <div className="section-head">
        <h2>Recent Servers</h2>
        <button className="section-link recent-refresh" onClick={load} disabled={loading}>
          <RefreshCw size={11} className={loading ? 'is-spinning' : ''} /> Refresh
        </button>
      </div>

      {servers.length ? (
        <div className="recent-server-list">
          {servers.map((server) => (
            <div className="recent-server" key={server.address.toLowerCase()}>
              <span className="recent-server-icon" aria-hidden="true">
                <Server size={16} />
              </span>
              <span className="recent-server-info">
                <strong title={server.address}>{server.address}</strong>
                <small title={`Instance: ${server.instanceName}`}>
                  {server.instanceName}
                </small>
              </span>
              <span className="recent-server-time" title={new Date(server.connectedAt).toLocaleString()}>
                <Clock3 size={10} /> {timeAgo(server.connectedAt)}
              </span>
            </div>
          ))}
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
