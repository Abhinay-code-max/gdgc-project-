import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../api.js';
import { LogoLoader } from '../components/LogoLoader.jsx';
import { Notice } from '../components.jsx';

export function HomePage({ user }) {
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api('/api/paintings')
      .then((paintings) => {
        if (active) {
          // Take first 3 paintings as featured
          setFeatured(paintings.slice(0, 3));
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="home-page">
      {/* Hero section */}
      <section className="hero">
        <div>
          <p className="eyebrow">CONTEMPORARY WORKING ATELIER</p>
          <h1>
            Original work,<br />
            thoughtfully <em>created.</em>
          </h1>
          <p>
            Atelier is a living studio and gallery presenting one-of-a-kind original paintings.
            Each painting in our collection is an authentic single-edition physical artwork.
          </p>
          <div style={{ display: 'flex', gap: '16px', marginTop: '28px', flexWrap: 'wrap' }}>
            <Link to="/gallery" className="button">
              Browse Gallery
            </Link>
            {!user ? (
              <Link to="/login" className="button button--quiet">
                Sign In to Collect
              </Link>
            ) : (
              <Link to={user.role === 'studio' ? '/seller' : '/buyer'} className="button button--quiet">
                Go to {user.role === 'studio' ? 'Seller Dashboard' : 'Buyer Dashboard'}
              </Link>
            )}
          </div>
        </div>
        <div className="hero-mark" aria-hidden="true">
          A
        </div>
      </section>

      {/* Featured Paintings Section */}
      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FEATURED SELECTIONS</p>
            <h2>From the Studio Floor</h2>
          </div>
          <Link to="/gallery" className="button button--quiet">
            View All ({featured.length}+)
          </Link>
        </div>

        {loading ? (
          <LogoLoader message="Curating featured paintings…" />
        ) : error ? (
          <Notice kind="error">{error}</Notice>
        ) : featured.length === 0 ? (
          <p className="muted">The studio catalogue is currently being refreshed.</p>
        ) : (
          <div className="painting-grid">
            {featured.map((painting) => (
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
                    <Link to="/gallery" className="button button--quiet">
                      View in Gallery
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Services and Studio Status section */}
      <section className="content-section" style={{ borderTop: '1px solid #d5cabc' }}>
        <p className="eyebrow">STUDIO SERVICES & CAPABILITIES</p>
        <h2>Active and Planned Services</h2>
        <p className="muted" style={{ maxWidth: '680px', marginTop: '8px' }}>
          We provide transparent status on our studio services. Only fully verified and tested features are enabled.
        </p>

        <div className="home-services-grid">
          <div className="service-card">
            <span className="service-status-tag service-status-tag--active">Currently Active</span>
            <h3 style={{ marginTop: '14px' }}>Original Paintings</h3>
            <p>
              Verified lifecycle for original artworks: seller creation, editing of unsold works, atomic concurrency-guaranteed purchases,
              role-scoped order history, order cancellation, and repurchase availability.
            </p>
            <Link to="/gallery" style={{ color: 'var(--rust)', fontWeight: 600, textDecoration: 'none' }}>
              Explore Paintings &rarr;
            </Link>
          </div>

          <div className="service-card">
            <span className="service-status-tag service-status-tag--deferred">In Design / Deferred</span>
            <h3 style={{ marginTop: '14px' }}>Custom Wall Murals</h3>
            <p>
              On-site commissioned wall paintings. Booking is currently pending official studio dimension rates,
              regional calendar scheduling rules, and deposit verification. Not open for booking at this time.
            </p>
            <span className="muted">Bookings currently unavailable</span>
          </div>

          <div className="service-card">
            <span className="service-status-tag service-status-tag--deferred">Future Roadmap</span>
            <h3 style={{ marginTop: '14px' }}>Studio Ceramic & Pottery</h3>
            <p>
              Hand-thrown stoneware and studio pottery. Glaze formulations and shipping logistics are undergoing kiln trials.
              Will be introduced after full quality verification.
            </p>
            <span className="muted">Catalogue not yet released</span>
          </div>
        </div>
      </section>
    </div>
  );
}
