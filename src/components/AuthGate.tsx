import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import DataPanel from './DataPanel';
import PageTransition from './PageTransition';

export default function AuthGate() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <PageTransition><Outlet /></PageTransition>
      <DataPanel />
    </>
  );
}
