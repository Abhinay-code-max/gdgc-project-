import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, formatDateTime, formatMoney } from './api.js';
import { AsyncState, FieldError, Notice, StatusBadge } from './components.jsx';

const emptyAuth = { email: '', password: '' };
const emptyPainting = { title: '', description: '', price: '', imageUrl: '' };

function messageOf(error) {
  return error instanceof ApiError ? error.message : 'Something unexpected went wrong.';
}

function validatePainting(form) {
  const fields = {};
  if (!form.title.trim()) fields.title = 'Enter a title.';
  if (!form.description.trim()) fields.description = 'Enter a description.';
  if (!form.price || Number(form.price) <= 0) fields.priceMinor = 'Enter a price greater than zero.';
  if (form.imageUrl && !/^https?:\/\//i.test(form.imageUrl)) fields.imageUrl = 'Use a complete http:// or https:// URL.';
  return fields;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [view, setView] = useState('gallery');
  const [authMode, setAuthMode] = useState(null);
  const [toast, setToast] = useState(null);
  const [logoutPending, setLogoutPending] = useState(false);

  useEffect(() => {
    api('/api/auth/me')
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch((error) => {
        if (error.status !== 401) setToast({ kind: 'error', text: messageOf(error) });
      })
      .finally(() => setSessionLoading(false));
  }, []);

  const handleAuthenticated = (nextUser) => {
    setUser(nextUser);
    setAuthMode(null);
    setView(nextUser.role === 'studio' ? 'manage' : 'gallery');
    setToast({ kind: 'success', text: `Signed in as ${nextUser.email}.` });
  };

  const logout = async () => {
    setLogoutPending(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setView('gallery');
      setToast({ kind: 'success', text: 'You have been signed out.' });
    } catch (error) {
      setToast({ kind: 'error', text: messageOf(error) });
    } finally { setLogoutPending(false); }
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="wordmark" type="button" onClick={() => setView('gallery')} aria-label="Atelier home">
          <span>Atelier</span><small>ART STUDIO</small>
        </button>
        <nav aria-label="Main navigation">
          <button className={view === 'gallery' ? 'nav-active' : ''} onClick={() => setView('gallery')}>Paintings</button>
          {user?.role === 'customer' && <button className={view === 'orders' ? 'nav-active' : ''} onClick={() => setView('orders')}>My orders</button>}
          {user?.role === 'studio' && <button className={view === 'manage' ? 'nav-active' : ''} onClick={() => setView('manage')}>Manage studio</button>}
        </nav>
        <div className="account-actions">
          {sessionLoading ? <span className="muted">Checking session…</span> : user ? (
            <><span className="account-label">{user.email} · {user.role}</span><button className="button button--quiet" onClick={logout} disabled={logoutPending}>{logoutPending ? 'Logging out…' : 'Log out'}</button></>
          ) : (
            <><button className="button button--quiet" onClick={() => setAuthMode('login')}>Log in</button><button className="button" onClick={() => setAuthMode('register')}>Register</button></>
          )}
        </div>
      </header>

      {toast && <div className="toast-wrap"><Notice kind={toast.kind} action={<button aria-label="Dismiss message" onClick={() => setToast(null)}>×</button>}>{toast.text}</Notice></div>}

      <main>
        {view === 'gallery' && <Gallery user={user} openLogin={() => setAuthMode('login')} notify={setToast} />}
        {view === 'orders' && user?.role === 'customer' && <Orders customer notify={setToast} />}
        {view === 'manage' && user?.role === 'studio' && <StudioDashboard notify={setToast} />}
      </main>

      <footer><span>Original work, thoughtfully collected.</span><span>Purchases do not include online payment.</span></footer>
      {authMode && <AuthDialog mode={authMode} close={() => setAuthMode(null)} authenticated={handleAuthenticated} />}
    </div>
  );
}

function AuthDialog({ mode, close, authenticated }) {
  const [form, setForm] = useState(emptyAuth);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const isRegister = mode === 'register';

  const submit = async (event) => {
    event.preventDefault();
    setPending(true); setError(null); setFields({});
    try {
      const result = await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) });
      authenticated(result.user);
    } catch (problem) {
      setError(messageOf(problem));
      setFields(problem.fields ?? {});
    } finally { setPending(false); }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" onClick={close} aria-label="Close">×</button>
        <p className="eyebrow">{isRegister ? 'JOIN THE STUDIO' : 'WELCOME BACK'}</p>
        <h2 id="auth-title">{isRegister ? 'Create your collector account' : 'Log in to your account'}</h2>
        <p className="muted">{isRegister ? 'Registration creates a customer account.' : 'Customers and studio staff use the same secure login.'}</p>
        {error && <Notice kind={error.includes('already') ? 'conflict' : 'error'}>{error}</Notice>}
        <form onSubmit={submit}>
          <label>Email<input autoFocus type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><FieldError value={fields.email} /></label>
          <label>Password<input type="password" required minLength="12" autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><FieldError value={fields.password} /></label>
          <button className="button button--wide" disabled={pending}>{pending ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}</button>
        </form>
      </section>
    </div>
  );
}

function Gallery({ user, openLogin, notify }) {
  const [paintings, setPaintings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [conflict, setConflict] = useState(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try { setPaintings(await api('/api/paintings')); }
    catch (problem) { setError(messageOf(problem)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { Promise.resolve().then(() => load(false)); }, [load]);

  const purchase = async (painting) => {
    if (!user) { openLogin(); return; }
    setPendingId(painting.id); setConflict(null);
    try {
      await api(`/api/paintings/${painting.id}/purchase`, { method: 'POST' });
      notify({ kind: 'success', text: `“${painting.title}” is now in your orders.` });
      await load();
    } catch (problem) {
      if (problem.status === 409) { setConflict(problem.message); await load(); }
      else notify({ kind: 'error', text: messageOf(problem) });
    } finally { setPendingId(null); }
  };

  return (
    <>
      <section className="hero"><div><p className="eyebrow">ORIGINAL WORKS · ONE OF ONE</p><h1>Art that makes<br />a room feel <em>alive.</em></h1><p>Discover original paintings from our working studio. Each piece can be collected once.</p></div><div className="hero-mark" aria-hidden="true">A</div></section>
      <section className="content-section">
        <div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2>Available paintings</h2></div><button className="button button--quiet" onClick={load} disabled={loading}>Refresh</button></div>
        {conflict && <Notice kind="conflict">{conflict} The collection has been refreshed.</Notice>}
        <AsyncState loading={loading} error={error} retry={load} empty={!paintings.length} emptyText="The collection is empty. Please check back after the studio adds new work.">
          <div className="painting-grid">
            {paintings.map((painting) => <PaintingCard key={painting.id} painting={painting} user={user} pending={pendingId === painting.id} purchase={() => purchase(painting)} />)}
          </div>
        </AsyncState>
      </section>
    </>
  );
}

function PaintingCard({ painting, user, pending, purchase }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className="painting-card">
      <div className="painting-image">
        {painting.imageUrl && !imageFailed ? <img src={painting.imageUrl} alt={`Painting: ${painting.title}`} onError={() => setImageFailed(true)} /> : <div className="image-placeholder" aria-label="No image available"><span>{painting.title.slice(0, 1)}</span></div>}
        <span className={`availability ${painting.available ? '' : 'availability--sold'}`}>{painting.available ? 'Available' : 'Collected'}</span>
      </div>
      <div className="painting-info"><h3>{painting.title}</h3><p>{painting.description}</p><div className="painting-meta"><strong>{formatMoney(painting.priceMinor)}</strong>{user?.role !== 'studio' && <button className="button" disabled={!painting.available || pending} onClick={purchase}>{pending ? 'Purchasing…' : painting.available ? 'Purchase' : 'Sold'}</button>}</div></div>
    </article>
  );
}

function Orders({ customer, notify }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [conflict, setConflict] = useState(null);
  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try { setOrders(await api('/api/orders')); } catch (problem) { setError(messageOf(problem)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { Promise.resolve().then(() => load(false)); }, [load]);

  const cancel = async (order) => {
    setPendingId(order.id); setConflict(null);
    try { await api(`/api/orders/${order.id}/cancel`, { method: 'POST' }); notify({ kind: 'success', text: `Order #${order.id} was cancelled. The painting is available again.` }); await load(); }
    catch (problem) { if (problem.status === 409) { setConflict(problem.message); await load(); } else notify({ kind: 'error', text: messageOf(problem) }); }
    finally { setPendingId(null); }
  };
  return (
    <section className="content-section page-section">
      <div className="section-heading"><div><p className="eyebrow">{customer ? 'YOUR COLLECTION' : 'STUDIO SALES'}</p><h1>{customer ? 'My orders' : 'All orders'}</h1></div><button className="button button--quiet" onClick={load} disabled={loading}>Refresh</button></div>
      {conflict && <Notice kind="conflict">{conflict} Your orders have been refreshed.</Notice>}
      <AsyncState loading={loading} error={error} retry={load} empty={!orders.length} emptyText={customer ? 'You have not purchased a painting yet.' : 'No painting orders have been placed yet.'}>
        <div className="order-list">{orders.map((order) => <article className="order-row" key={order.id}><div><p className="eyebrow">ORDER #{order.id}</p><h3>{order.paintingTitle}</h3>{!customer && order.customerEmail && <p>{order.customerEmail}</p>}<small>Placed {formatDateTime(order.createdAt)}</small>{order.cancelledAt && <small> · Cancelled {formatDateTime(order.cancelledAt)}</small>}</div><div className="order-actions"><strong>{formatMoney(order.priceMinor)}</strong><StatusBadge status={order.status} />{customer && order.status === 'placed' && <button className="button button--danger" onClick={() => cancel(order)} disabled={pendingId === order.id}>{pendingId === order.id ? 'Cancelling…' : 'Cancel order'}</button>}</div></article>)}</div>
      </AsyncState>
    </section>
  );
}

function StudioDashboard({ notify }) {
  const [tab, setTab] = useState('paintings');
  return (
    <section className="content-section page-section">
      <div className="section-heading"><div><p className="eyebrow">STUDIO WORKSPACE</p><h1>Manage studio</h1></div><div className="tabs"><button className={tab === 'paintings' ? 'tab-active' : ''} onClick={() => setTab('paintings')}>Paintings</button><button className={tab === 'orders' ? 'tab-active' : ''} onClick={() => setTab('orders')}>All orders</button></div></div>
      {tab === 'paintings' ? <PaintingManager notify={notify} /> : <Orders notify={notify} />}
    </section>
  );
}

function PaintingManager({ notify }) {
  const [paintings, setPaintings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(async (showLoading = true) => { if (showLoading) setLoading(true); setError(null); try { setPaintings(await api('/api/paintings')); } catch (problem) { setError(messageOf(problem)); } finally { setLoading(false); } }, []);
  useEffect(() => { Promise.resolve().then(() => load(false)); }, [load]);
  return (
    <div>
      <div className="manager-bar"><p className="muted">Create new work or edit paintings that have not been sold.</p><button className="button" onClick={() => { setEditing(null); setShowForm(true); }}>Add painting</button></div>
      <AsyncState loading={loading} error={error} retry={load} empty={!paintings.length} emptyText="No paintings yet. Add the studio’s first painting.">
        <div className="manage-grid">{paintings.map((painting) => <article key={painting.id} className="manage-card"><div><StatusBadge status={painting.available ? 'available' : 'sold'} /><h3>{painting.title}</h3><p>{formatMoney(painting.priceMinor)}</p></div><button className="button button--quiet" disabled={!painting.available} title={!painting.available ? 'Sold paintings cannot be edited' : ''} onClick={() => { setEditing(painting); setShowForm(true); }}>Edit</button></article>)}</div>
      </AsyncState>
      {showForm && <PaintingDialog painting={editing} close={() => setShowForm(false)} saved={async () => { setShowForm(false); await load(); notify({ kind: 'success', text: editing ? 'Painting updated.' : 'Painting added to the collection.' }); }} />}
    </div>
  );
}

function PaintingDialog({ painting, close, saved }) {
  const [form, setForm] = useState(painting ? { title: painting.title, description: painting.description, price: (painting.priceMinor / 100).toFixed(2), imageUrl: painting.imageUrl ?? '' } : emptyPainting);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const submit = async (event) => {
    event.preventDefault();
    const clientFields = validatePainting(form);
    if (Object.keys(clientFields).length) { setFields(clientFields); return; }
    setPending(true); setError(null); setFields({});
    const body = { title: form.title.trim(), description: form.description.trim(), priceMinor: Math.round(Number(form.price) * 100), imageUrl: form.imageUrl.trim() || null };
    try { await api(painting ? `/api/paintings/${painting.id}` : '/api/paintings', { method: painting ? 'PATCH' : 'POST', body: JSON.stringify(body) }); await saved(); }
    catch (problem) { setError(messageOf(problem)); setFields(problem.fields ?? {}); }
    finally { setPending(false); }
  };
  return (
    <div className="modal-backdrop" role="presentation"><section className="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="painting-form-title"><button className="modal-close" onClick={close} aria-label="Close">×</button><p className="eyebrow">STUDIO CATALOGUE</p><h2 id="painting-form-title">{painting ? 'Edit painting' : 'Add a painting'}</h2>{error && <Notice kind={error.toLowerCase().includes('sold') ? 'conflict' : 'error'}>{error}</Notice>}<form onSubmit={submit}><label>Title<input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><FieldError value={fields.title} /></label><label>Description<textarea rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><FieldError value={fields.description} /></label><label>Price in rupees<input type="number" min="0.01" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /><FieldError value={fields.priceMinor} /></label><label>Image URL <span className="muted">(optional)</span><input type="url" placeholder="https://…" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /><FieldError value={fields.imageUrl} /></label><div className="form-actions"><button type="button" className="button button--quiet" onClick={close}>Cancel</button><button className="button" disabled={pending}>{pending ? 'Saving…' : 'Save painting'}</button></div></form></section></div>
  );
}
