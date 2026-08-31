import './NewsSection.css';

/**
 * News cards. Each card is artwork with its wordmark, matching the design; the
 * blurb is the accessible name and is revealed on hover.
 */
export default function NewsSection({ items, onOpen }) {
  return (
    <section className="news">
      <h2 className="eyebrow news-heading">News</h2>

      <div className="news-grid">
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`news-card news-card--${item.tone}`}
            aria-label={`${item.title} — ${item.blurb}`}
            onClick={() => onOpen(item.url)}
          >
            {item.image ? (
              <img className="news-art" src={item.image} alt="" />
            ) : (
              <span className="news-art news-art--painted" aria-hidden="true">
                <span className="news-wordmark">{item.wordmark}</span>
              </span>
            )}
            <span className="news-blurb" aria-hidden="true">{item.blurb}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
