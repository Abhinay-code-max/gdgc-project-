import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="notfound-container">
      <p className="eyebrow">ERROR 404</p>
      <div className="notfound-code">404</div>
      <h1 className="notfound-title">Page Not Found</h1>
      <p className="notfound-desc">
        The canvas you are looking for does not exist or has been relocated within the Atelier archives.
      </p>
      <div className="notfound-actions">
        <Link to="/" className="button">
          Return to Studio Home
        </Link>
        <Link to="/gallery" className="button button--quiet">
          Browse Paintings Gallery
        </Link>
      </div>
    </div>
  );
}
