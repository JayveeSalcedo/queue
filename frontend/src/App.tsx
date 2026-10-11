import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { QueueProvider } from './context/QueueContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { GuardPage } from './pages/GuardPage';
import { CounterPage } from './pages/CounterPage';
import { DisplayPage } from './pages/DisplayPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <QueueProvider>
          <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-amber-300 selection:text-emerald-950">
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
                      <CounterPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/counter/:id"
                  element={
                    <ProtectedRoute allow={['COUNTER']}>
                      <CounterPage />
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
