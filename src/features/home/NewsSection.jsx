import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import './NewsSection.css';

const NEWS_PAGE = 'https://www.minecraft.net/en-us/article';

function openExternal(url) {
  if (window.native?.openExternal) return window.native.openExternal(url);
  window.open(url, '_blank', 'noopener,noreferrer');
  return undefined;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NewsSection() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (force = false) => {
    const api = window.native?.news;
    if (!api) {
      setLoading(false);
      setError('Live news is available in the desktop launcher.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await api.list({ force });
      setItems(result.items || []);
      if (result.stale) setError('Showing saved news while Minecraft is unreachable.');
    } catch {
      setError('Could not load Minecraft news.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="news">
      <div className="section-head">
        <h2>Latest News</h2>
        <button className="section-link" onClick={() => openExternal(NEWS_PAGE)}>
          View all News
        </button>
      </div>

      {error && (
        <div className={`news-notice${items.length ? ' news-notice--quiet' : ''}`}>
          <span>{error}</span>
          <button onClick={() => load(true)} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'is-spinning' : ''} /> Retry
          </button>
        </div>
      )}

      <div className="news-grid" aria-busy={loading}>
        {loading && items.length === 0
          ? Array.from({ length: 4 }, (_, index) => (
            <div className="news-card news-card--skeleton" key={index} />
          ))
          : items.map((item) => (
            <button
              type="button"
              className="news-card"
              key={item.id}
              onClick={() => openExternal(item.url)}
              title={item.summary}
            >
              <img src={item.image} alt="" loading="lazy" />
              <div className="news-overlay">
                <span className="news-copy">
                  <span className="news-title">{item.title}</span>
                  <small>{item.category} · {formatDate(item.date)}</small>
                </span>
                <span className="news-go" aria-hidden="true">
                  <ArrowRight size={14} />
                </span>
              </div>
            </button>
          ))}
      </div>
    </section>
  );
}
