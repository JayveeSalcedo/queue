import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQueue } from '../context/QueueContext';
import { AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const { settings } = useQueue();
  const navigate = useNavigate();
  const location = useLocation();

  const officeName = settings.office_name || 'PANELCO III SOUTHEAST AREA OFFICE';

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
      // A counter account only ever goes back to its own counter's screen.
      const ownCounterPath = user.counter_id ? `/counter/${user.counter_id}` : '/counter';
      if (redirectTo) {
        const allowed =
          user.role === 'ADMIN' ||
          (user.role === 'GUARD' && redirectTo.startsWith('/guard')) ||
          (user.role === 'COUNTER' &&
            (user.counter_id
              ? redirectTo === ownCounterPath || redirectTo === `${ownCounterPath}/mini`
              : redirectTo.startsWith('/counter')));
        if (allowed) {
          navigate(redirectTo, { replace: true });
          return;
        }
      }

      if (user.role === 'GUARD') {
        navigate('/guard');
      } else if (user.role === 'COUNTER') {
        navigate(ownCounterPath);
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

  return (
    <div className="min-h-[calc(100vh-4.25rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="PANELCO III logo"
            className="w-16 h-16 rounded-full object-contain mx-auto ring-1 ring-slate-200 bg-white"
          />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">Sign in to your station</h1>
          <p className="mt-1 text-sm text-slate-500">{officeName}</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm ring-1 ring-inset ring-red-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="username" className="label">
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </div>

          <button type="submit" disabled={isSubmitting} className="btn btn-primary w-full py-3">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500 text-balance">
          Authorized staff only. Contact your administrator if you cannot sign in.
        </p>
      </div>
    </div>
  );
};
