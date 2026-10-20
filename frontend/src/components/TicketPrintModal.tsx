import React, { useState, useEffect } from 'react';
import { Ticket } from '../types';
import { thermalPrinterService } from '../services/printer';
import { QUEUE_META } from '../queueStyles';
import { Printer, Bluetooth, CheckCircle2, X, Undo2, AlertTriangle } from 'lucide-react';

interface Props {
  ticket: Ticket | null;
  onClose: () => void;
  isBluetoothConnected: boolean;
  onConnectBluetooth: () => Promise<void>;
  onVoid: (ticketId: number) => Promise<void>;
}

export const TicketPrintModal: React.FC<Props> = ({
  ticket,
  onClose,
  isBluetoothConnected,
  onConnectBluetooth,
  onVoid,
}) => {
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

  // Reset the undo confirmation whenever a different ticket is shown
  useEffect(() => {
    setConfirmVoid(false);
    setIsVoiding(false);
    setPrintStatus(null);
  }, [ticket?.id]);

  if (!ticket) return null;

  const handleVoid = async () => {
    if (!confirmVoid) {
      setConfirmVoid(true);
      return;
    }
    setIsVoiding(true);
    try {
      await onVoid(ticket.id);
    } finally {
      setIsVoiding(false);
    }
  };

  const handleBluetoothPrint = async () => {
    if (!isBluetoothConnected) {
      try {
        await onConnectBluetooth();
      } catch (err: any) {
        setPrintStatus('Bluetooth connection failed: ' + err.message);
        return;
      }
    }

    try {
      setPrintStatus('Printing via Bluetooth...');
      await thermalPrinterService.printViaBluetooth(ticket);
      setPrintStatus('Printed successfully!');
      setTimeout(() => setPrintStatus(null), 2500);
    } catch (err: any) {
      setPrintStatus('Bluetooth error: ' + err.message + '. Falling back to browser print.');
      thermalPrinterService.printViaBrowser(ticket);
    }
  };

  const handleBrowserPrint = () => {
    thermalPrinterService.printViaBrowser(ticket);
  };

  const meta = QUEUE_META[ticket.queue_type];

  return (
    <div className="modal-backdrop">
      <div className="modal max-w-sm flex flex-col" role="dialog" aria-modal="true" aria-labelledby="ticket-title">
        {/* Header */}
        <div className="card-header">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h2 id="ticket-title" className="text-base font-semibold text-slate-900">
              Ticket issued
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost p-1.5" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ticket preview */}
        <div className="px-6 pt-6 pb-5 bg-slate-50">
          <div className="bg-white rounded-lg border border-dashed border-slate-300 px-6 py-6 text-center">
            <span className={`badge ${meta.chip}`}>{meta.label}</span>
            <div className="ticket-no text-6xl text-slate-900 mt-3 select-all">{ticket.queue_number}</div>
            <p className="mt-2 text-sm text-slate-500">
              {meta.counter} · Issued {ticket.time_formatted || new Date(ticket.created_at).toLocaleTimeString()}
            </p>
          </div>

          {printStatus && (
            <div className="mt-3 text-sm px-3 py-2 rounded-lg bg-white text-slate-700 ring-1 ring-inset ring-slate-200 text-center">
              {printStatus}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-slate-200 space-y-2.5">
          <button onClick={handleBluetoothPrint} className="btn btn-primary w-full py-3">
            <Bluetooth className="w-4 h-4" />
            Print to Bluetooth printer
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={handleBrowserPrint} className="btn btn-secondary">
              <Printer className="w-4 h-4" />
              Browser print
            </button>
            <button onClick={onClose} autoFocus className="btn btn-secondary">
              Done
            </button>
          </div>

          {/* Undo / Void - for mis-taps. Two-step so it can't be hit by accident. */}
          <div className="pt-2.5 mt-1 border-t border-slate-100">
            {confirmVoid ? (
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirmVoid(false)}
                  disabled={isVoiding}
                  className="btn btn-secondary flex-1"
                >
                  Keep ticket
                </button>
                <button onClick={handleVoid} disabled={isVoiding} className="btn btn-danger flex-1">
                  <AlertTriangle className="w-4 h-4" />
                  {isVoiding ? 'Voiding…' : `Void ${ticket.queue_number}`}
                </button>
              </div>
            ) : (
              <button onClick={handleVoid} className="btn btn-ghost w-full text-red-700 hover:bg-red-50 hover:text-red-800">
                <Undo2 className="w-4 h-4" />
                Wrong button? Void this ticket
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
