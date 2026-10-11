import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border-2 border-amber-500">
        <div className="bg-amber-500 text-emerald-950 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-6 h-6 text-emerald-950" />
            <span className="font-extrabold text-lg">Confirm Daily Reset</span>
          </div>
          <button
            onClick={onClose}
            disabled={isResetting}
            className="text-emerald-950 hover:bg-amber-400 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-slate-700 font-medium text-sm leading-relaxed">
            Are you sure you want to <strong className="text-emerald-950">Start a New Day</strong>?
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1.5 font-medium">
            <p className="font-bold flex items-center">
              Notice:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>All active and waiting tickets from earlier will be archived.</li>
              <li>Queue ticket numbers will restart at <strong>001</strong> (e.g. R-001, P-001, C-001).</li>
              <li>Counters will clear their current serving ticket.</li>
            </ul>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isResetting}
            className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isResetting}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-emerald-950 font-black text-sm shadow-md transition-all flex items-center space-x-2"
          >
            {isResetting ? 'Resetting...' : 'Yes, Start New Day'}
          </button>
        </div>
      </div>
    </div>
  );
};
