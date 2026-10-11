import React, { useState } from 'react';
import { QueueType } from '../types';
import { ArrowRightLeft, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  ticketNumber: string;
  onClose: () => void;
  onTransfer: (targetQueue: QueueType, notes?: string) => Promise<void>;
  isTransferring: boolean;
}

export const TransferModal: React.FC<Props> = ({
  isOpen,
  ticketNumber,
  onClose,
  onTransfer,
  isTransferring,
}) => {
  const [targetQueue, setTargetQueue] = useState<QueueType>('COMPLAINT');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onTransfer(targetQueue, notes);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border-2 border-emerald-700">
        <div className="bg-emerald-800 text-white px-5 py-4 flex items-center justify-between border-b-2 border-amber-400">
          <div className="flex items-center space-x-2">
            <ArrowRightLeft className="w-5 h-5 text-amber-300" />
            <span className="font-extrabold text-base">Transfer Ticket {ticketNumber}</span>
          </div>
          <button
            onClick={onClose}
            disabled={isTransferring}
            className="text-emerald-200 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Transfer To Queue / Service
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['REGULAR', 'PRIORITY', 'COMPLAINT'] as QueueType[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setTargetQueue(q)}
                  className={`py-2 px-1 text-xs font-bold rounded-lg border-2 text-center transition-all ${
                    targetQueue === q
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {q === 'COMPLAINT' ? 'Request/Comp' : q}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason / Transfer Note (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Needs supervisor assistance"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isTransferring}
              className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-sm text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isTransferring}
              className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm shadow-md transition-all"
            >
              {isTransferring ? 'Transferring...' : 'Confirm Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
