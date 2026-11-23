import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, LogOut } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' = red button, Cancel focused first (deleting, voiding). 'default' = green. */
  tone?: 'danger' | 'default';
  icon?: 'warning' | 'logout';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Asks the user to confirm. Resolves true on confirm, false on cancel / Esc / click outside. */
export const useConfirm = (): ConfirmFn => {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used within a ConfirmProvider');
  return fn;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    // A second request while one is open cancels the first
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(opts);
    });
  }, []);

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  };

  useEffect(() => {
    if (!options) return;
    (options.tone === 'danger' ? cancelRef : confirmRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [options]);

  const danger = options?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="modal-backdrop z-[60]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
        >
          <div className="modal max-w-sm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="p-5 flex gap-4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  danger ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {options.icon === 'logout' ? <LogOut className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <h2 id="confirm-title" className="text-base font-semibold text-slate-900">
                  {options.title}
                </h2>
                {options.message && <div className="mt-1 text-sm text-slate-600">{options.message}</div>}
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button ref={cancelRef} onClick={() => close(false)} className="btn btn-secondary">
                {options.cancelLabel || 'Cancel'}
              </button>
              <button ref={confirmRef} onClick={() => close(true)} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}>
                {options.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
