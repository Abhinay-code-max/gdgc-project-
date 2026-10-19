export function Notice({ kind = 'info', children, action }) {
  return (
    <div className={`notice notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {action}
    </div>
  );
}

export function AsyncState({ loading, error, empty, emptyText, retry, children }) {
  if (loading) {
    return <div className="state-card" role="status"><span className="spinner" /> Loading…</div>;
  }
  if (error) {
    return (
      <div className="state-card state-card--error" role="alert">
        <p>{error}</p>
        <button className="button button--quiet" type="button" onClick={retry}>Try again</button>
      </div>
    );
  }
  if (empty) {
    return <div className="state-card"><p>{emptyText}</p></div>;
  }
  return children;
}

export function FieldError({ value }) {
  return value ? <small className="field-error">{value}</small> : null;
}

export function StatusBadge({ status }) {
  return <span className={`badge badge--${status}`}>{status}</span>;
}
