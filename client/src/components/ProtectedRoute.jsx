import { Navigate } from 'react-router-dom';
import { LogoLoader } from './LogoLoader.jsx';

export function ProtectedRoute({ user, loading, requiredRole, children }) {
  if (loading) {
    return <LogoLoader message="Verifying authentication credentials…" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    // If buyer tries to access seller dashboard -> redirect to buyer
    // If seller tries to access buyer dashboard -> redirect to seller
    const target = user.role === 'studio' ? '/seller' : '/buyer';
    return <Navigate to={target} replace />;
  }

  return children;
}
