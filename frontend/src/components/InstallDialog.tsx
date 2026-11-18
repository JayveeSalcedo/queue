import React from 'react';
import { Download, Monitor, Share, Smartphone, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { detectPlatform } from '../services/platform';
import { downloadWindowsInstaller, ShortcutSpec } from '../services/windowsShortcuts';
import { MINI_WINDOW_SIZE, miniWindowPath } from '../services/miniWindow';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** Shortcuts that make sense for whoever is signed in on this PC */
function shortcutsFor(user: ReturnType<typeof useAuth>['user']): ShortcutSpec[] {
  if (user?.role === 'COUNTER' && user.counter_id) {
    const n = user.counter_id;
    return [
      { name: `Counter ${n}`, path: `/counter/${n}` },
      {
        name: `Counter ${n} - Mini`,
        path: miniWindowPath(n),
        size: MINI_WINDOW_SIZE,
        miniApp: { counter: n, ...MINI_WINDOW_SIZE },
        startWithWindows: true,
      },
    ];
  }
  if (user?.role === 'GUARD') return [{ name: 'Queue Guard', path: '/guard' }];
  if (user?.role === 'ADMIN') return [{ name: 'Queue Admin', path: '/admin' }];
  return [{ name: 'Queue', path: '/' }];
}

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li className="flex gap-3">
    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
      {n}
    </span>
    <span>{children}</span>
  </li>
);

export const InstallDialog: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user } = useAuth();

  if (!isOpen) return null;

  const platform = detectPlatform();
  const shortcuts = shortcutsFor(user);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="w-10 h-10 rounded-full ring-1 ring-slate-200" />
            <div>
              <h2 id="install-title" className="text-base font-semibold text-slate-900">
                Add to your {platform.isMobile ? 'home screen' : 'desktop'}
              </h2>
              <p className="text-xs text-slate-500">Opens like an app, one tap away.</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost p-1.5" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 text-sm text-slate-700">
          {/* iPhone / iPad */}
          {platform.isIOS && (
            <section>
              <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                <Smartphone className="w-4 h-4" /> On this iPhone / iPad
              </h3>
              <ol className="mt-3 space-y-2.5">
                <Step n={1}>
                  Open this page in <strong>Safari</strong>.
                </Step>
                <Step n={2}>
                  Tap the <Share className="inline w-4 h-4 -mt-0.5" /> <strong>Share</strong> button.
                </Step>
                <Step n={3}>
                  Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
                </Step>
              </ol>
            </section>
          )}

          {/* Android phone / tablet */}
          {platform.isAndroid && (
            <section>
              <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                <Smartphone className="w-4 h-4" /> On this phone
              </h3>
              <ol className="mt-3 space-y-2.5">
                <Step n={1}>
                  In <strong>Chrome</strong>, tap the <strong>⋮</strong> menu (top right).
                </Step>
                <Step n={2}>
                  Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).
                </Step>
                <Step n={3}>
                  Tap <strong>Add</strong>. The Queue icon appears on the home screen.
                </Step>
              </ol>
              {user?.role === 'GUARD' && (
                <p className="mt-3 text-xs text-slate-500">
                  The ticket printer pairs through Chrome, so keep using Chrome for the guard station.
                </p>
              )}
            </section>
          )}

          {/* Windows PC */}
          {platform.isWindows && (
            <section>
              <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                <Monitor className="w-4 h-4" /> On this PC
              </h3>
              <p className="mt-2 text-slate-600">Adds Desktop icons that open in their own window, no browser tabs:</p>
              <ul className="mt-2 space-y-1 text-slate-800">
                {shortcuts.map((s) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    <span className="font-medium">{s.name}</span>
                    {s.size && <span className="text-xs text-slate-500">small window, stays on top</span>}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => downloadWindowsInstaller(window.location.origin, shortcuts, 'Install-Queue-Shortcuts.bat')}
                className="btn btn-primary w-full mt-4 py-3"
              >
                <Download className="w-4 h-4" />
                Download Windows shortcuts
              </button>
              <ol className="mt-3 space-y-2 text-xs text-slate-500">
                <Step n={1}>
                  Open the downloaded file. If the browser asks, choose <strong>Keep</strong>.
                </Step>
                <Step n={2}>
                  If Windows shows a blue "protected your PC" box, click <strong>More info</strong> then{' '}
                  <strong>Run anyway</strong>.
                </Step>
              </ol>
            </section>
          )}

          {/* Anything else (Mac, Linux, ...) */}
          {!platform.isIOS && !platform.isAndroid && !platform.isWindows && (
            <p>
              In Chrome or Edge open the browser menu and choose <strong>Install</strong> or{' '}
              <strong>Create shortcut</strong> (tick <em>Open as window</em>).
            </p>
          )}
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-right">
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
