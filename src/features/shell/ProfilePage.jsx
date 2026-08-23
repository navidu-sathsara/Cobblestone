import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes, CalendarDays, ChevronRight, Clock3, Gamepad2, Loader2,
  RefreshCw, Timer, Trophy, UserRound, WifiOff,
} from 'lucide-react';
import Avatar from '../../components/ui/Avatar.jsx';
import './ProfilePage.css';

const EMPTY_ACTIVITY = {
  totalLauncherSeconds: 0,
  totalPlaySeconds: 0,
  launchCount: 0,
  lastSeenAt: null,
  lastPlayedAt: null,
  lastInstance: null,
  instances: [],
  recentLaunches: []
};

function duration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours >= 100) return `${hours.toLocaleString()}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return value ? `${value}s` : '0m';
}

function relativeDate(value) {
  if (!value) return 'Not played yet';
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return 'Unknown';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function accountLabel(account) {
  if (account?.type === 'microsoft') return 'Microsoft Minecraft account';
  if (account?.type === 'native') return 'Linked Minecraft profile';
  if (account?.type === 'offline') return 'Offline Minecraft profile';
  return 'Guest profile';
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="mc-profile-stat">
      <span className="mc-profile-stat-icon"><Icon size={16} /></span>
      <div><small>{label}</small><strong>{value}</strong>{hint && <span>{hint}</span>}</div>
    </div>
  );
}

export default function ProfilePage({ account, onOpenInstance = () => {}, onOpenAccounts = () => {} }) {
  const [activity, setActivity] = useState(EMPTY_ACTIVITY);
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await window.native?.telemetry?.flush?.();
      const result = await window.native?.telemetry?.profile?.();
      setLinked(Boolean(result?.linked));
      setOffline(Boolean(result?.offline));
      setActivity(result?.profile?.activity ? { ...EMPTY_ACTIVITY, ...result.profile.activity } : EMPTY_ACTIVITY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return window.native?.telemetry?.onUpdated?.((next) => {
      if (next) setActivity((current) => ({ ...current, ...next }));
    });
  }, [load]);

  const instances = useMemo(
    () => [...(activity.instances || [])].sort((a, b) => (b.playSeconds || 0) - (a.playSeconds || 0)),
    [activity.instances]
  );
  const favorite = instances[0] || null;
  const username = account?.name || 'Player';
  const skinKey = account?.uuid || username || 'MHF_Steve';

  return (
    <div className="mc-profile-page">
      <section className="mc-profile-hero">
        <div className="mc-profile-hero-grid" />
        <div className="mc-profile-player">
          <div className="mc-profile-avatar-wrap">
            <Avatar className="mc-profile-avatar" uuid={account?.uuid} />
            <span className="mc-profile-online" />
          </div>
          <div className="mc-profile-identity">
            <span className="mc-profile-eyebrow"><UserRound size={12} /> Minecraft profile</span>
            <h1>{username}</h1>
            <p>{accountLabel(account)}</p>
          </div>
        </div>

        <div className="mc-profile-skin-stage" aria-hidden="true">
          <div className="mc-profile-skin-glow" />
          <img src={`https://mc-heads.net/body/${encodeURIComponent(skinKey)}/right`} alt="" />
        </div>

        <div className="mc-profile-hero-actions">
          <button className="mc-profile-refresh" onClick={load} disabled={loading} title="Refresh play history">
            {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
          </button>
          <span className={`mc-profile-sync${linked ? ' is-linked' : ''}`}>
            <span /> {offline ? 'Saved history' : linked ? 'Play history synced' : 'Local profile'}
          </span>
        </div>
      </section>

      {!linked && (
        <section className="mc-profile-link-notice">
          <WifiOff size={18} />
          <div><strong>Keep your Minecraft history across devices</strong><p>Link your Minecraft profile to sync playtime, instances, and recent sessions.</p></div>
          <button onClick={onOpenAccounts}>Link profile <ChevronRight size={14} /></button>
        </section>
      )}

      <section className="mc-profile-stats">
        <Stat icon={Gamepad2} label="Minecraft time" value={duration(activity.totalPlaySeconds)} hint="Measured while the game is running" />
        <Stat icon={Timer} label="Launcher time" value={duration(activity.totalLauncherSeconds)} hint="Time spent in this launcher" />
        <Stat icon={Trophy} label="Launches" value={Number(activity.launchCount || 0).toLocaleString()} hint="Successful Minecraft starts" />
        <Stat icon={Boxes} label="Instances played" value={Number(instances.length).toLocaleString()} hint={favorite ? `Most played: ${favorite.name}` : 'No instance history yet'} />
      </section>

      <div className="mc-profile-columns">
        <section className="mc-profile-panel mc-profile-last-played">
          <div className="mc-profile-section-head"><div><span>Continue playing</span><h2>Last played</h2></div><CalendarDays size={18} /></div>
          {activity.lastInstance ? (
            <button className="mc-profile-last-card" onClick={() => onOpenInstance(activity.lastInstance.id)}>
              <span className="mc-profile-instance-mark">{String(activity.lastInstance.loader || 'V').slice(0, 1)}</span>
              <span className="mc-profile-last-copy"><strong>{activity.lastInstance.name}</strong><small>{activity.lastInstance.loader} · Minecraft {activity.lastInstance.version}</small><em>{relativeDate(activity.lastPlayedAt)}</em></span>
              <span className="mc-profile-play-arrow"><ChevronRight size={18} /></span>
            </button>
          ) : (
            <div className="mc-profile-empty"><Gamepad2 size={22} /><strong>Your next world starts here</strong><p>Launch an instance and it will appear in your profile.</p></div>
          )}
        </section>

        <section className="mc-profile-panel">
          <div className="mc-profile-section-head"><div><span>Your pattern</span><h2>Most played</h2></div><Clock3 size={18} /></div>
          {instances.length ? (
            <div className="mc-profile-instance-list">
              {instances.slice(0, 4).map((instance, index) => (
                <button key={instance.id} onClick={() => onOpenInstance(instance.id)}>
                  <em>{String(index + 1).padStart(2, '0')}</em>
                  <span><strong>{instance.name}</strong><small>{instance.loader} · {instance.version}</small></span>
                  <span className="mc-profile-instance-time">{duration(instance.playSeconds)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mc-profile-empty mc-profile-empty-small"><Clock3 size={20} /><p>Instance playtime will build as you play.</p></div>
          )}
        </section>
      </div>

      <section className="mc-profile-panel mc-profile-sessions">
        <div className="mc-profile-section-head"><div><span>Timeline</span><h2>Recent Minecraft sessions</h2></div><span className="mc-profile-session-count">{activity.recentLaunches?.length || 0} sessions</span></div>
        {activity.recentLaunches?.length ? (
          <div className="mc-profile-session-list">
            {activity.recentLaunches.slice(0, 8).map((session) => (
              <button key={`${session.launchId}-${session.startedAt}`} onClick={() => onOpenInstance(session.id)}>
                <span className="mc-profile-session-dot" />
                <span className="mc-profile-session-main"><strong>{session.name}</strong><small>{session.loader} · Minecraft {session.version}</small></span>
                <span className="mc-profile-session-date">{relativeDate(session.endedAt || session.startedAt)}</span>
                <span className="mc-profile-session-duration">{session.endedAt ? duration(session.playSeconds) : 'Playing'}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mc-profile-empty mc-profile-empty-wide"><Gamepad2 size={22} /><strong>No Minecraft sessions yet</strong><p>Your latest games will be listed here automatically.</p></div>
        )}
      </section>
    </div>
  );
}
