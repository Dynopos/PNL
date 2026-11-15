import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '../../components/Spinner';
import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner fullScreen />;
  if (!session) return <Navigate to="/masuk" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
