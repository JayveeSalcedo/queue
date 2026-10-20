import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
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
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-emerald-700 animate-spin" />
        <p className="mt-3 text-sm text-slate-500">Checking sign-in…</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    // Remember where they were headed so login can send them straight back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.role !== 'ADMIN' && !allow.includes(user.role)) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="card p-6 text-center">
          <div className="w-11 h-11 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">This account can't open this station</h1>
          <p className="text-sm text-slate-600 mt-2">
            You are signed in as <span className="font-medium text-slate-900">{user.full_name}</span> (
            {user.role.toLowerCase()}).
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Sign out from the top bar and sign in with a {allow.map((r) => r.toLowerCase()).join(' or ')} account.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
