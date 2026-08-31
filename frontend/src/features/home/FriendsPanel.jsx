import { useState } from 'react';
import { ArrowUpRight, User } from 'lucide-react';
import { headUrl } from '../../lib/format.js';
import './FriendsPanel.css';

function FriendHead({ name }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="friend-head friend-head--fallback">
        <User size={16} strokeWidth={2.2} />
      </span>
    );
  }
  return (
    <img className="friend-head" src={headUrl(name, 60)} alt="" onError={() => setFailed(true)} />
  );
}

/**
 * Friends list. The launcher core ships no social service, so `friends` is
 * presentation data supplied by the caller (see ./data.js).
 */
export default function FriendsPanel({ friends, onViewMore }) {
  const online = friends.filter((friend) => friend.presence !== 'offline').length;

  return (
    <section className="friends" data-testid="friends-panel">
      <header className="friends-head">
        <h2 className="eyebrow eyebrow--muted">Friends</h2>
        <span className="friends-online">{online} online</span>
      </header>

      <ul className="friends-list scroll-hidden">
        {friends.map((friend, index) => (
          <li key={friend.id}>
            <div className="friend-row" style={{ animationDelay: `${index * 40}ms` }}>
              <FriendHead name={friend.name} />
              <span className="friend-text">
                <span className="friend-name">{friend.name}</span>
                <span className="friend-status">{friend.status}</span>
              </span>
              <span className={`dot dot--${friend.presence}`} />
            </div>
          </li>
        ))}
      </ul>

      <button type="button" className="friends-more" data-testid="friends-view-more" onClick={onViewMore}>
        View more
        <ArrowUpRight size={12} strokeWidth={2.6} />
      </button>
    </section>
  );
}
