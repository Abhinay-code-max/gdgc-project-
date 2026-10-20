import { useState, useEffect, useCallback } from 'react';
import { api, ApiError, formatDateTime, formatMoney, displayRole } from '../api.js';
import { Notice, AsyncState, StatusBadge, FieldError } from '../components.jsx';
import { LogoLoader } from '../components/LogoLoader.jsx';

const emptyPainting = { title: '', description: '', price: '', imageUrl: '' };

function validatePainting(form) {
  const fields = {};
  if (!form.title.trim()) fields.title = 'Enter a title.';
  if (!form.description.trim()) fields.description = 'Enter a description.';
  if (!form.price || Number(form.price) <= 0) fields.priceMinor = 'Enter a price greater than zero.';
  if (form.imageUrl && !/^https?:\/\//i.test(form.imageUrl)) {
    fields.imageUrl = 'Use a complete http:// or https:// URL.';
  }
  return fields;
}

export function SellerDashboard({ user, notify }) {
  const [tab, setTab] = useState('paintings');

  return (
    <section className="content-section page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{displayRole(user?.role).toUpperCase()} WORKSPACE</p>
          <h1>Studio Management</h1>
          <p className="muted" style={{ marginTop: '4px' }}>
            Logged in as <strong>{user?.email}</strong> · Role: <strong>{displayRole(user?.role)}</strong>
          </p>
        </div>
        <div className="tabs">
          <button
            className={tab === 'paintings' ? 'tab-active' : ''}
            onClick={() => setTab('paintings')}
          >
            Paintings Catalogue
          </button>
          <button
            className={tab === 'orders' ? 'tab-active' : ''}
            onClick={() => setTab('orders')}
          >
            All Studio Orders
          </button>
        </div>
      </div>

      {tab === 'paintings' ? (
        <PaintingManager notify={notify} />
      ) : (
        <StudioOrders notify={notify} />
      )}
    </section>
  );
}

function PaintingManager({ notify }) {
  const [paintings, setPaintings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

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

  return (
    <div>
      <div className="manager-bar">
        <p className="muted">
          Add new works to the collection or edit details of paintings that have not been collected.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="button button--quiet" onClick={() => load(true)} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            className="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            + Add Painting
          </button>
        </div>
      </div>

      {loading ? (
        <LogoLoader message="Loading studio inventory…" />
      ) : (
        <AsyncState
          loading={false}
          error={error}
          retry={() => load(true)}
          empty={!paintings.length}
          emptyText="No paintings in studio inventory yet. Create your first painting."
        >
          <div className="manage-grid">
            {paintings.map((painting) => (
              <article key={painting.id} className="manage-card">
                <div>
                  <StatusBadge status={painting.available ? 'available' : 'sold'} />
                  <h3>{painting.title}</h3>
                  <p>{formatMoney(painting.priceMinor)}</p>
                  <small className="muted">{painting.description}</small>
                </div>
                <div>
                  <button
                    className="button button--quiet"
                    disabled={!painting.available}
                    title={!painting.available ? 'Sold paintings cannot be edited' : 'Edit painting'}
                    onClick={() => {
                      setEditing(painting);
                      setShowForm(true);
                    }}
                  >
                    Edit
                  </button>
                </div>
              </article>
            ))}
          </div>
        </AsyncState>
      )}

      {showForm && (
        <PaintingDialog
          painting={editing}
          close={() => setShowForm(false)}
          saved={async () => {
            setShowForm(false);
            await load(false);
            notify({
              kind: 'success',
              text: editing ? 'Painting successfully updated.' : 'New painting added to catalogue.',
            });
          }}
        />
      )}
    </div>
  );
}

function PaintingDialog({ painting, close, saved }) {
  const [form, setForm] = useState(
    painting
      ? {
          title: painting.title,
          description: painting.description,
          price: (painting.priceMinor / 100).toFixed(2),
          imageUrl: painting.imageUrl ?? '',
        }
      : emptyPainting
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});

  const submit = async (event) => {
    event.preventDefault();
    const clientFields = validatePainting(form);
    if (Object.keys(clientFields).length) {
      setFields(clientFields);
      return;
    }
    setPending(true);
    setError(null);
    setFields({});

    const body = {
      title: form.title.trim(),
      description: form.description.trim(),
      priceMinor: Math.round(Number(form.price) * 100),
      imageUrl: form.imageUrl.trim() || null,
    };

    try {
      await api(painting ? `/api/paintings/${painting.id}` : '/api/paintings', {
        method: painting ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      await saved();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Failed to save painting.');
      setFields(problem.fields ?? {});
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <section
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="painting-form-title"
      >
        <button className="modal-close" onClick={close} aria-label="Close dialog">
          ×
        </button>
        <p className="eyebrow">STUDIO CATALOGUE</p>
        <h2 id="painting-form-title">{painting ? 'Edit Painting' : 'Add New Painting'}</h2>
        {error && <Notice kind="error">{error}</Notice>}
        <form onSubmit={submit} noValidate>
          <label>
            Title
            <input
              autoFocus
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              disabled={pending}
            />
            <FieldError value={fields.title} />
          </label>
          <label>
            Description
            <textarea
              rows="4"
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={pending}
            />
            <FieldError value={fields.description} />
          </label>
          <label>
            Price in Rupees (INR)
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              disabled={pending}
            />
            <FieldError value={fields.priceMinor} />
          </label>
          <label>
            Image URL <span className="muted">(optional)</span>
            <input
              type="url"
              placeholder="https://images.example.com/art.jpg"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              disabled={pending}
            />
            <FieldError value={fields.imageUrl} />
          </label>
          <div className="form-actions">
            <button type="button" className="button button--quiet" onClick={close} disabled={pending}>
              Cancel
            </button>
            <button className="button" disabled={pending}>
              {pending ? 'Saving…' : painting ? 'Save Changes' : 'Create Painting'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function StudioOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await api('/api/orders');
      setOrders(data);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Failed to load studio orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => load(true));
  }, [load]);

  return (
    <div>
      <div className="manager-bar">
        <p className="muted">All painting collection orders across all buyers, including buyer contact email.</p>
        <button className="button button--quiet" onClick={() => load(true)} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh Orders'}
        </button>
      </div>

      {loading ? (
        <LogoLoader message="Loading studio order registry…" />
      ) : (
        <AsyncState
          loading={false}
          error={error}
          retry={() => load(true)}
          empty={!orders.length}
          emptyText="No customer painting orders have been placed yet."
        >
          <div className="order-list">
            {orders.map((order) => (
              <article className="order-row" key={order.id}>
                <div>
                  <p className="eyebrow">ORDER #{order.id}</p>
                  <h3>{order.paintingTitle}</h3>
                  {order.customerEmail && (
                    <p style={{ margin: '4px 0' }}>
                      Buyer: <strong>{order.customerEmail}</strong>
                    </p>
                  )}
                  <small>Placed {formatDateTime(order.createdAt)}</small>
                  {order.cancelledAt && (
                    <small> · Cancelled {formatDateTime(order.cancelledAt)}</small>
                  )}
                </div>
                <div className="order-actions">
                  <strong>{formatMoney(order.priceMinor)}</strong>
                  <StatusBadge status={order.status} />
                </div>
              </article>
            ))}
          </div>
        </AsyncState>
      )}
    </div>
  );
}
