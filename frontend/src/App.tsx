import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { QueueProvider } from './context/QueueContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { GuardPage } from './pages/GuardPage';
import { CounterPage } from './pages/CounterPage';
import { DisplayPage } from './pages/DisplayPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';

/**
 * Keeps a counter account on its own counter: /counter or another counter's
 * link (e.g. a bookmark left from a different operator) goes to /counter/<own>.
 * Admins can open any counter.
 */
const OwnCounterOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  if (user?.role === 'COUNTER' && user.counter_id && id !== String(user.counter_id)) {
    return <Navigate to={`/counter/${user.counter_id}`} replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <QueueProvider>
          <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-950">
            <Navbar />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route
                  path="/guard"
                  element={
                    <ProtectedRoute allow={['GUARD']}>
                      <GuardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/counter"
                  element={
                    <ProtectedRoute allow={['COUNTER']}>
                      <OwnCounterOnly>
                        <CounterPage />
                      </OwnCounterOnly>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/counter/:id"
                  element={
                    <ProtectedRoute allow={['COUNTER']}>
                      <OwnCounterOnly>
                        <CounterPage />
                      </OwnCounterOnly>
                    </ProtectedRoute>
                  }
                />
                {/* Public waiting-area TV - intentionally open, no login */}
                <Route path="/display" element={<DisplayPage />} />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute allow={['ADMIN']}>
                      <AdminPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/login" element={<LoginPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </QueueProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
