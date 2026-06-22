import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import DataPanel from './DataPanel';
import PageTransition from './PageTransition';
import ScrollToTop from './ScrollToTop';
import type { AuthRole } from '../lib/constants';

export default function AuthGate({ role = 'attendance' }: { role?: AuthRole }) {
  const { isAuthenticated } = useAuth(role);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <PageTransition><Outlet /></PageTransition>
      {/* Data/Ideas FABs belong to the attendance section only. */}
      {role === 'attendance' && <DataPanel />}
      <ScrollToTop />
    </>
  );
}
