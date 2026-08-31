import { useState } from 'react';
import { ExternalLink, User } from 'lucide-react';
import { headUrl } from '../../lib/format.js';
import './FriendsPanel.css';

function FriendHead({ name }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="friend-head friend-head--fallback">
        <User size={17} strokeWidth={2.2} />
      </span>
    );
  }
  return (
    <img
      className="friend-head"
      src={headUrl(name, 60)}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Friends list. The launcher core ships no social service, so `friends` is
 * presentation data supplied by the caller (see ./data.js).
 */
export default function FriendsPanel({ friends, onViewMore }) {
  return (
    <section className="friends">
      <header className="friends-head">
        <h2 className="eyebrow">Friends</h2>
        <button type="button" className="friends-more" onClick={onViewMore}>
          View More
          <ExternalLink size={11} strokeWidth={2.4} />
        </button>
      </header>

      <ul className="friends-list scroll-hidden">
        {friends.map((friend) => (
          <li key={friend.id}>
            <div className="friend-row">
              <span className={`dot dot--${friend.presence}`} />
              <FriendHead name={friend.name} />
              <span className="friend-text">
                <span className="friend-name">{friend.name}</span>
                <span className="friend-status">{friend.status}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
