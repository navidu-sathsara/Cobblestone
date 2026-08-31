import { ArrowUpRight } from 'lucide-react';
import './NewsSection.css';

/**
 * News cards. Each card is artwork carrying its wordmark; the blurb is part of
 * the accessible name and slides up on hover.
 */
export default function NewsSection({ items, onOpen }) {
  return (
    <section className="news" data-testid="news-section">
      <header className="news-head">
        <h2 className="eyebrow eyebrow--muted">Latest</h2>
      </header>

      <div className="news-grid">
        {items.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={`news-card news-card--${item.tone}`}
            aria-label={`${item.title} — ${item.blurb}`}
            data-testid={`news-card-${item.id}`}
            style={{ animationDelay: `${index * 60}ms` }}
            onClick={() => onOpen(item.url)}
          >
            {item.image ? (
              <img className="news-art" src={item.image} alt="" />
            ) : (
              <span className="news-art news-art--painted" aria-hidden="true" />
            )}

            <span className="news-body">
              <span className="news-wordmark">{item.wordmark}</span>
              <span className="news-blurb">{item.blurb}</span>
            </span>

            <span className="news-open" aria-hidden="true">
              <ArrowUpRight size={13} strokeWidth={2.8} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
