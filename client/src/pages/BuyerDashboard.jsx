import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, formatDateTime, formatMoney, displayRole } from '../api.js';
import { Notice, AsyncState, StatusBadge } from '../components.jsx';
import { LogoLoader } from '../components/LogoLoader.jsx';

export function BuyerDashboard({ user, notify }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [conflict, setConflict] = useState(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await api('/api/orders');
      setOrders(data);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Failed to load order history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => load(true));
  }, [load]);

  const cancel = async (order) => {
    setPendingId(order.id);
    setConflict(null);
    try {
      await api(`/api/orders/${order.id}/cancel`, { method: 'POST' });
      notify({
        kind: 'success',
        text: `Order #${order.id} for “${order.paintingTitle}” has been cancelled. The painting is now available again.`,
      });
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
    <section className="content-section page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{displayRole(user?.role).toUpperCase()} DASHBOARD</p>
          <h1>My Painting Orders</h1>
          <p className="muted" style={{ marginTop: '4px' }}>
            Signed in as <strong>{user?.email}</strong> · Role: <strong>{displayRole(user?.role)}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/gallery" className="button button--quiet">
            Browse Paintings
          </Link>
          <button className="button button--quiet" onClick={() => load(true)} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh Orders'}
          </button>
        </div>
      </div>

      {conflict && (
        <Notice kind="conflict">
          {conflict} Your order history has been refreshed.
        </Notice>
      )}

      {loading ? (
        <LogoLoader message="Loading your collection orders…" />
      ) : (
        <AsyncState
          loading={false}
          error={error}
          retry={() => load(true)}
          empty={!orders.length}
          emptyText="You have not collected any paintings yet. Browse the gallery to select an original work."
        >
          <div className="order-list">
            {orders.map((order) => (
              <article className="order-row" key={order.id}>
                <div>
                  <p className="eyebrow">ORDER #{order.id}</p>
                  <h3>{order.paintingTitle}</h3>
                  <small>Placed {formatDateTime(order.createdAt)}</small>
                  {order.cancelledAt && (
                    <small> · Cancelled {formatDateTime(order.cancelledAt)}</small>
                  )}
                </div>
                <div className="order-actions">
                  <strong>{formatMoney(order.priceMinor)}</strong>
                  <StatusBadge status={order.status} />
                  {order.status === 'placed' && (
                    <button
                      className="button button--danger"
                      onClick={() => cancel(order)}
                      disabled={pendingId === order.id}
                    >
                      {pendingId === order.id ? 'Cancelling…' : 'Cancel order'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </AsyncState>
      )}
    </section>
  );
}
