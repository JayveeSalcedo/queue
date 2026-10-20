import React, { useState } from 'react';
import { QueueType } from '../types';
import { QUEUE_META } from '../queueStyles';
import { X } from 'lucide-react';

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
    <div className="modal-backdrop">
      <div className="modal max-w-md" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
        <div className="card-header">
          <div>
            <h2 id="transfer-title" className="text-base font-semibold text-slate-900">
              Transfer {ticketNumber}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">The customer goes back in line for the queue you choose.</p>
          </div>
          <button onClick={onClose} disabled={isTransferring} className="btn btn-ghost p-1.5" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            <fieldset>
              <legend className="label">Transfer to</legend>
              <div className="space-y-2">
                {(['REGULAR', 'PRIORITY', 'COMPLAINT'] as QueueType[]).map((q) => {
                  const selected = targetQueue === q;
                  return (
                    <label
                      key={q}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selected
                          ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="target-queue"
                        value={q}
                        checked={selected}
                        onChange={() => setTargetQueue(q)}
                        className="accent-emerald-700"
                      />
                      <span className={`w-2 h-2 rounded-full ${QUEUE_META[q].dot}`} />
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-slate-900">{QUEUE_META[q].label}</span>
                        <span className="block text-xs text-slate-500">
                          {QUEUE_META[q].counter} · {QUEUE_META[q].description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor="transfer-notes" className="label">
                Note <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="transfer-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Needs supervisor assistance"
                className="input"
              />
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} disabled={isTransferring} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isTransferring} className="btn btn-primary">
              {isTransferring ? 'Transferring…' : 'Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
