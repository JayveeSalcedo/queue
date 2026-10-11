import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Lock, User, LogIn, ArrowRight } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Set by ProtectedRoute (router state) when it bounces an unauthenticated
  // station here, or by ?next= on the hard redirect from an expired session.
  const redirectTo =
    (location.state as { from?: string } | null)?.from ||
    new URLSearchParams(location.search).get('next') ||
    undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await login(username, password);

      // Send them back to the exact screen they asked for (e.g. /counter/2),
      // as long as their role is allowed to open it.
      if (redirectTo) {
        const allowed =
          user.role === 'ADMIN' ||
          (user.role === 'GUARD' && redirectTo.startsWith('/guard')) ||
          (user.role === 'COUNTER' && redirectTo.startsWith('/counter'));
        if (allowed) {
          navigate(redirectTo, { replace: true });
          return;
        }
      }

      if (user.role === 'GUARD') {
        navigate('/guard');
      } else if (user.role === 'COUNTER') {
        navigate('/counter');
      } else if (user.role === 'ADMIN') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full overflow-hidden border-2 border-emerald-800">
        {/* Header */}
        <div className="bg-emerald-900 border-b-4 border-amber-400 p-8 text-center text-white">
          <img
            src="/logo.png"
            alt="PANELCO III logo"
            className="w-20 h-20 rounded-full bg-white object-contain p-1 mx-auto mb-3 shadow-lg"
          />
          <h1 className="text-2xl font-black tracking-tight">Staff Authentication</h1>
          <p className="text-xs text-amber-300 font-semibold tracking-wide uppercase mt-1">
            Local Queue Network
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. guard, counter1, admin"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-amber-300 font-black text-sm flex items-center justify-center space-x-2 shadow-md hover:shadow-lg transition-all"
          >
            <LogIn className="w-4 h-4" />
            <span>{isSubmitting ? 'Signing in...' : 'Sign In to Station'}</span>
          </button>

          {/* Quick Demo Fill Buttons for Staff Convenience */}
          <div className="pt-4 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block text-center mb-2.5">
              Quick Fill Station Accounts
            </span>
            <div className="flex flex-wrap gap-1.5 justify-center">
              <button
                type="button"
                onClick={() => handleQuickFill('guard', 'guard123')}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200"
              >
                Guard
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('counter1', 'counter123')}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200"
              >
                Counter 1
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('counter2', 'counter123')}
                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs border border-amber-200"
              >
                Counter 2
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('counter3', 'counter123')}
                className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-900 font-bold text-xs border border-teal-200"
              >
                Counter 3
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('admin', 'admin123')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300"
              >
                Admin
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
