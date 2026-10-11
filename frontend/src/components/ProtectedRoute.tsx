import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';

interface Props {
  /** Roles allowed on this route. ADMIN is always allowed. */
  allow: Array<User['role']>;
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<Props> = ({ allow, children }) => {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Wait for the stored token to be validated before deciding, so a page
  // refresh on a station does not flash the login screen.
  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-800 text-amber-300 font-black text-2xl flex items-center justify-center shadow-md animate-pulse">
          Q
        </div>
        <p className="mt-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
          Checking station sign-in...
        </p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    // Remember where they were headed so login can send them straight back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.role !== 'ADMIN' && !allow.includes(user.role)) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-3xl p-8 shadow-sm border-2 border-amber-300">
          <h1 className="text-xl font-black text-emerald-950">Wrong station account</h1>
          <p className="text-sm text-slate-600 font-medium mt-2">
            You are signed in as <span className="font-black">{user.full_name}</span> ({user.role}),
            which cannot open this screen.
          </p>
          <p className="text-xs text-slate-500 mt-3">
            Sign out from the top bar and sign in with a {allow.join(' or ')} account.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
