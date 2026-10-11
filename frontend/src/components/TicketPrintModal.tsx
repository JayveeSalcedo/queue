import React, { useState, useEffect } from 'react';
import { Ticket } from '../types';
import { thermalPrinterService } from '../services/printer';
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

  const queueColor =
    ticket.queue_type === 'REGULAR'
      ? 'bg-emerald-600 text-white'
      : ticket.queue_type === 'PRIORITY'
      ? 'bg-amber-400 text-emerald-950 font-black'
      : 'bg-teal-700 text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border-2 border-emerald-700 flex flex-col">
        {/* Header */}
        <div className="bg-emerald-800 text-white px-5 py-4 flex items-center justify-between border-b-2 border-amber-400">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-6 h-6 text-amber-300" />
            <span className="font-extrabold text-lg">Ticket Generated</span>
          </div>
          <button
            onClick={onClose}
            className="text-emerald-200 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ticket Visual Card */}
        <div className="p-6 text-center bg-slate-50 flex flex-col items-center">
          <div className={`px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 ${queueColor}`}>
            {ticket.queue_type} QUEUE
          </div>

          <div className="text-6xl font-black tracking-tight text-emerald-950 my-2 select-all font-mono">
            {ticket.queue_number}
          </div>

          <p className="text-sm text-slate-500 font-medium">
            Issued at {ticket.time_formatted || new Date(ticket.created_at).toLocaleTimeString()}
          </p>

          {printStatus && (
            <div className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
              {printStatus}
            </div>
          )}
        </div>

        {/* Dual Print Action Buttons */}
        <div className="p-5 bg-white border-t border-slate-200 space-y-3">
          <button
            onClick={handleBluetoothPrint}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-base flex items-center justify-center space-x-2 shadow-md hover:shadow-lg transition-all"
          >
            <Bluetooth className="w-5 h-5 text-amber-300" />
            <span>Print Bluetooth (58mm)</span>
          </button>

          <button
            onClick={handleBrowserPrint}
            className="w-full py-2.5 px-4 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-sm flex items-center justify-center space-x-2 transition-all"
          >
            <Printer className="w-4 h-4 text-amber-700" />
            <span>Browser Print Dialog</span>
          </button>

          <button
            onClick={onClose}
            autoFocus
            className="w-full py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-all"
          >
            Done (Next Customer)
          </button>

          {/* Undo / Void - for mis-taps. Two-step so it can't be hit by accident. */}
          <button
            onClick={handleVoid}
            disabled={isVoiding}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-60 ${
              confirmVoid
                ? 'bg-red-600 hover:bg-red-700 text-white border-2 border-red-800 shadow-md'
                : 'bg-white hover:bg-red-50 text-red-700 border border-red-300'
            }`}
          >
            {confirmVoid ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <Undo2 className="w-4 h-4" />
            )}
            <span>
              {isVoiding
                ? 'Voiding...'
                : confirmVoid
                ? `Tap again to void ${ticket.queue_number}`
                : 'Undo - wrong button / mis-tap'}
            </span>
          </button>

          {confirmVoid && !isVoiding && (
            <button
              onClick={() => setConfirmVoid(false)}
              className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700 py-1"
            >
              Keep this ticket
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
