import React, { useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';

const MIN_PASSWORD_LENGTH = 6;

/** Lets the signed-in admin change their own username and password. */
export const AdminAccountCard: React.FC = () => {
  const { user, updateAccount } = useAuth();
  const confirm = useConfirm();
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  if (!user) return null;

  const newUsername = username.trim();
  const changingUsername = newUsername !== '' && newUsername !== user.username;
  const changingPassword = newPassword !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDone('');

    if (!changingUsername && !changingPassword) {
      setError('Type a new username or a new password.');
      return;
    }
    if (changingPassword && newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (changingPassword && newPassword !== repeatPassword) {
      setError('The two new passwords do not match.');
      return;
    }
    if (!currentPassword) {
      setError('Enter your current password to confirm it is you.');
      return;
    }

    const what = [changingUsername && 'username', changingPassword && 'password'].filter(Boolean).join(' and ');
    const ok = await confirm({
      title: `Change your ${what}?`,
      message: changingUsername
        ? `From now on you will sign in as "${newUsername}".`
        : 'From now on you will sign in with the new password.',
      confirmLabel: 'Change',
    });
    if (!ok) return;

    setSaving(true);
    try {
      await updateAccount({
        current_password: currentPassword,
        new_username: changingUsername ? newUsername : undefined,
        new_password: changingPassword ? newPassword : undefined,
      });
      setDone(`Your ${what} ${what.includes('and') ? 'were' : 'was'} changed.`);
      setUsername('');
      setNewPassword('');
      setRepeatPassword('');
      setCurrentPassword('');
    } catch (err: any) {
      setError(err.message || 'Could not update the account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card mt-6">
      <div className="card-header">
        <div>
          <div className="card-title">Admin account</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Signed in as <span className="font-medium text-slate-700">{user.username}</span>. Change the username, the
            password, or both.
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label htmlFor="acct-username" className="label">
              Username
            </label>
            <input
              id="acct-username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={user.username}
              autoComplete="username"
              maxLength={32}
            />
            <p className="text-xs text-slate-500 mt-1">
              3-32 characters: letters, numbers, dot, dash or underscore. Leave empty to keep it.
            </p>
          </div>
          <div>
            <label htmlFor="acct-new" className="label">
              New password
            </label>
            <input
              id="acct-new"
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-slate-500 mt-1">At least {MIN_PASSWORD_LENGTH} characters. Leave empty to keep it.</p>
          </div>
          <div>
            <label htmlFor="acct-repeat" className="label">
              Repeat new password
            </label>
            <input
              id="acct-repeat"
              type="password"
              className="input"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              autoComplete="new-password"
              disabled={!changingPassword}
            />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-5 max-w-sm">
          <label htmlFor="acct-current" className="label">
            Current password
          </label>
          <input
            id="acct-current"
            type="password"
            className="input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <p className="text-xs text-slate-500 mt-1">Required to save any change.</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        {done && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {done}
          </div>
        )}
      </div>

      <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? 'Saving…' : 'Change account'}
        </button>
      </div>
    </form>
  );
};
