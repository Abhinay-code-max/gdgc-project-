import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, formatMoney } from '../api.js';
import { Notice, AsyncState } from '../components.jsx';
import { LogoLoader } from '../components/LogoLoader.jsx';

export function GalleryPage({ user, notify }) {
  const navigate = useNavigate();
  const [paintings, setPaintings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [conflict, setConflict] = useState(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await api('/api/paintings');
      setPaintings(data);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Failed to load paintings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => load(true));
  }, [load]);

  const purchase = async (painting) => {
    if (!user) {
      navigate('/login');
      return;
    }
    setPendingId(painting.id);
    setConflict(null);

    try {
      await api(`/api/paintings/${painting.id}/purchase`, { method: 'POST' });
      notify({ kind: 'success', text: `“${painting.title}” was successfully placed in your orders.` });
      await load(false);
    } catch (problem) {
      if (problem.status === 409) {
        setConflict(problem.message);
        await load(false);
      } else {
        notify({ kind: 'error', text: problem.message });
      }
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="content-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">THE COLLECTION</p>
          <h1>Paintings Gallery</h1>
          <p className="muted" style={{ marginTop: '4px' }}>
            Browse our original single-edition paintings. Each work is physical and unique.
          </p>
        </div>
        <button className="button button--quiet" onClick={() => load(true)} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh Gallery'}
        </button>
      </div>

      {conflict && (
        <Notice kind="conflict">
          {conflict} The collection availability has been updated.
        </Notice>
      )}

      {loading ? (
        <LogoLoader message="Loading studio collection…" />
      ) : (
        <AsyncState
          loading={false}
          error={error}
          retry={() => load(true)}
          empty={!paintings.length}
          emptyText="The studio collection is currently empty. Please check back soon."
        >
          <div className="painting-grid">
            {paintings.map((painting) => (
              <article className="painting-card" key={painting.id}>
                <div className="painting-image">
                  {painting.imageUrl ? (
                    <img src={painting.imageUrl} alt={`Painting: ${painting.title}`} />
                  ) : (
                    <div className="image-placeholder" aria-label="No image available">
                      <span>{painting.title.slice(0, 1)}</span>
                    </div>
                  )}
                  <span className={`availability ${painting.available ? '' : 'availability--sold'}`}>
                    {painting.available ? 'Available' : 'Collected'}
                  </span>
                </div>
                <div className="painting-info">
                  <h3>{painting.title}</h3>
                  <p>{painting.description}</p>
                  <div className="painting-meta">
                    <strong>{formatMoney(painting.priceMinor)}</strong>
                    {user?.role !== 'studio' && (
                      <button
                        className="button"
                        disabled={!painting.available || pendingId === painting.id}
                        onClick={() => purchase(painting)}
                      >
                        {pendingId === painting.id
                          ? 'Purchasing…'
                          : painting.available
                          ? 'Purchase'
                          : 'Sold'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </AsyncState>
      )}
    </div>
  );
}
