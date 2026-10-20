import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isResetting: boolean;
}

export const ResetConfirmModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  isResetting,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal max-w-md" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <div className="p-6 flex gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 id="reset-title" className="text-base font-semibold text-slate-900">
              Start a new day?
            </h2>
            <p className="mt-1 text-sm text-slate-600">This prepares the queue for a fresh day of service:</p>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-600 list-disc pl-5">
              <li>Tickets still waiting or being served are closed and archived.</li>
              <li>
                Numbering restarts at <span className="font-medium text-slate-900">001</span> (R-001, P-001, C-001).
              </li>
              <li>Every counter's current customer is cleared.</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button onClick={onClose} disabled={isResetting} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isResetting} className="btn btn-primary">
            {isResetting ? 'Resetting…' : 'Start new day'}
          </button>
        </div>
      </div>
    </div>
  );
};
