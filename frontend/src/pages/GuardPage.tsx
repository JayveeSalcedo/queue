import React, { useState } from 'react';
import { QueueType, Ticket } from '../types';
import { api } from '../services/api';
import { useQueue } from '../context/QueueContext';
import { thermalPrinterService } from '../services/printer';
import { TicketPrintModal } from '../components/TicketPrintModal';
import { ResetConfirmModal } from '../components/ResetConfirmModal';
import { 
  RotateCcw, 
  Bluetooth, 
  ListOrdered,
  Undo2,
  Users
} from 'lucide-react';

export const GuardPage: React.FC = () => {
  const { waitingCounts, waitingTickets, refreshState, settings } = useQueue();
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showQueueList, setShowQueueList] = useState(false);
  const [issuedThisSession, setIssuedThisSession] = useState<Ticket[]>([]);
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [voidNotice, setVoidNotice] = useState<string | null>(null);
  const [bluetoothConnected, setBluetoothConnected] = useState(thermalPrinterService.isConnected());
  const [printerDeviceName, setPrinterDeviceName] = useState<string | null>(thermalPrinterService.getConnectedDeviceName());

  const handleGenerateTicket = async (queueType: QueueType) => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const ticket = await api.generateTicket(queueType);
      setCreatedTicket(ticket);
      setVoidNotice(null);
      setIssuedThisSession((prev) => [ticket, ...prev].slice(0, 6));
      
      // Auto-trigger Bluetooth print if connected
      if (thermalPrinterService.isConnected()) {
        try {
          await thermalPrinterService.printViaBluetooth(ticket);
        } catch (printErr) {
          console.warn('Auto bluetooth print failed:', printErr);
        }
      }
    } catch (err: any) {
      alert('Failed to generate ticket: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVoidTicket = async (ticketId: number) => {
    setVoidingId(ticketId);
    try {
      const res = await api.voidTicket(ticketId);
      setIssuedThisSession((prev) => prev.filter((t) => t.id !== ticketId));
      if (createdTicket?.id === ticketId) setCreatedTicket(null);
      setVoidNotice(
        res.sequence_rolled_back
          ? `${res.queue_number} voided - that number will be issued again to the next customer.`
          : `${res.queue_number} voided.`
      );
      await refreshState();
    } catch (err: any) {
      alert('Could not void ticket: ' + err.message);
      await refreshState();
    } finally {
      setVoidingId(null);
    }
  };

  const handleConnectBluetooth = async () => {
    try {
      await thermalPrinterService.connectBluetooth();
      setBluetoothConnected(true);
      setPrinterDeviceName(thermalPrinterService.getConnectedDeviceName());
    } catch (err: any) {
      if (err.name !== 'NotFoundError') { // Not user cancelled
        alert('Bluetooth error: ' + err.message);
      }
    }
  };

  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      await api.resetDaily();
      setIsResetModalOpen(false);
      await refreshState();
      alert('Queue numbers reset to 001 for the day.');
    } catch (err: any) {
      alert('Reset failed: ' + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  const regPrefix = settings.regular_prefix || 'R';
  const priPrefix = settings.priority_prefix || 'P';
  const compPrefix = settings.complaint_prefix || 'C';

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      {/* Station Header & Bluetooth Printer Bar */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-emerald-100 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-emerald-950 flex items-center space-x-1.5">
            <span>Guard Ticketing</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium">1-tap ticket issuing & 58mm thermal print</p>
        </div>

        {/* Bluetooth status / connect button */}
        <button
          onClick={handleConnectBluetooth}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all shadow-sm ${
            bluetoothConnected
              ? 'bg-emerald-100 text-emerald-900 border-2 border-emerald-400'
              : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-2 border-amber-300'
          }`}
        >
          <Bluetooth className="w-5 h-5 text-emerald-800" />
          <span>{bluetoothConnected ? (printerDeviceName || 'Printer Paired') : 'Pair 58mm'}</span>
        </button>
      </div>

      {/* 1-Tap EXTRA LARGE Generation Buttons */}
      <div className="space-y-4">
        {/* Regular Queue Button */}
        <button
          onClick={() => handleGenerateTicket('REGULAR')}
          disabled={isGenerating}
          className="w-full relative group overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-800 via-emerald-700 to-emerald-800 hover:from-emerald-700 hover:to-emerald-600 text-white p-6 sm:p-7 shadow-xl hover:shadow-2xl active:scale-98 transition-all text-left border-3 border-emerald-900 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-5">
              <div className="w-16 h-16 rounded-2xl bg-emerald-950/70 border-2 border-emerald-400 flex items-center justify-center font-mono font-black text-3xl text-amber-300 shadow-inner">
                {regPrefix}
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-black block tracking-tight">REGULAR</span>
                <span className="text-xs sm:text-sm text-emerald-200 font-semibold block mt-0.5">Counter 1 • Standard Inquiries</span>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-3.5 py-1.5 rounded-xl bg-emerald-950 text-amber-300 font-mono font-black text-base shadow-sm">
                {waitingCounts.REGULAR} waiting
              </span>
            </div>
          </div>
        </button>

        {/* Priority Queue Button */}
        <button
          onClick={() => handleGenerateTicket('PRIORITY')}
          disabled={isGenerating}
          className="w-full relative group overflow-hidden rounded-3xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-emerald-950 p-6 sm:p-7 shadow-xl hover:shadow-2xl active:scale-98 transition-all text-left border-3 border-amber-600 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-5">
              <div className="w-16 h-16 rounded-2xl bg-amber-700/25 border-2 border-amber-700 flex items-center justify-center font-mono font-black text-3xl text-emerald-950 shadow-inner">
                {priPrefix}
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-black block tracking-tight">PRIORITY</span>
                <span className="text-xs sm:text-sm text-amber-950 font-bold block mt-0.5">Counter 2 • Seniors, PWD, Pregnant</span>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-3.5 py-1.5 rounded-xl bg-emerald-950 text-amber-300 font-mono font-black text-base shadow-sm">
                {waitingCounts.PRIORITY} waiting
              </span>
            </div>
          </div>
        </button>

        {/* Request / Complaint Queue Button */}
        <button
          onClick={() => handleGenerateTicket('COMPLAINT')}
          disabled={isGenerating}
          className="w-full relative group overflow-hidden rounded-3xl bg-gradient-to-r from-teal-800 via-teal-700 to-teal-800 hover:from-teal-700 hover:to-teal-600 text-white p-6 sm:p-7 shadow-xl hover:shadow-2xl active:scale-98 transition-all text-left border-3 border-teal-900 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-5">
              <div className="w-16 h-16 rounded-2xl bg-teal-950/70 border-2 border-teal-400 flex items-center justify-center font-mono font-black text-3xl text-amber-300 shadow-inner">
                {compPrefix}
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-black block tracking-tight">REQUEST / COMPLAINT</span>
                <span className="text-xs sm:text-sm text-teal-200 font-semibold block mt-0.5">Counter 3 • Formal Complaints & Inquiries</span>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-3.5 py-1.5 rounded-xl bg-teal-950 text-amber-300 font-mono font-black text-base shadow-sm">
                {waitingCounts.COMPLAINT} waiting
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* Today's Queue Status Grid & Side Drawer Toggle */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Current Waiting Summary
          </h3>
          <button
            onClick={() => setShowQueueList(!showQueueList)}
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center space-x-1"
          >
            <ListOrdered className="w-4 h-4 text-emerald-700" />
            <span>{showQueueList ? 'Hide Queue List' : 'View In-Queue List'}</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
            <span className="text-3xl font-black text-emerald-800 font-mono">{waitingCounts.REGULAR}</span>
            <span className="block text-xs font-bold text-emerald-950 mt-1">Regular</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
            <span className="text-3xl font-black text-amber-800 font-mono">{waitingCounts.PRIORITY}</span>
            <span className="block text-xs font-bold text-amber-950 mt-1">Priority</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200">
            <span className="text-3xl font-black text-teal-800 font-mono">{waitingCounts.COMPLAINT}</span>
            <span className="block text-xs font-bold text-teal-950 mt-1">Complaint</span>
          </div>
        </div>

        {/* Optional Collapsible In-Queue List for Guard */}
        {showQueueList && (
          <div className="pt-3 border-t border-slate-100 space-y-2 max-h-60 overflow-y-auto">
            {waitingTickets.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-2">No customers waiting in line.</p>
            ) : (
              waitingTickets.map((t, idx) => (
                <div key={t.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-slate-400 font-bold">#{idx + 1}</span>
                    <span className="font-mono font-black text-base text-emerald-950">{t.queue_number}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white border border-slate-200">
                      {t.queue_type}
                    </span>
                  </div>
                  <span className="text-slate-400 font-medium">{t.created_at?.split(' ')[1] || ''}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Undo strip: tickets issued from this phone, voidable while still waiting */}
      {(issuedThisSession.length > 0 || voidNotice) && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
            <Undo2 className="w-4 h-4 text-red-500" />
            <span>Issued from this device - tap Void to undo a mis-tap</span>
          </h3>

          {voidNotice && (
            <div className="text-xs font-bold px-3 py-2 rounded-xl bg-amber-50 text-amber-900 border border-amber-300">
              {voidNotice}
            </div>
          )}

          <div className="space-y-2">
            {issuedThisSession.map((t) => {
              const stillWaiting = (waitingTickets || []).some((w) => w.id === t.id);
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <div className="flex items-center space-x-2.5">
                    <span className="font-mono font-black text-base text-emerald-950">{t.queue_number}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white border border-slate-200 text-slate-600">
                      {t.queue_type}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {t.time_formatted || ''}
                    </span>
                  </div>

                  {stillWaiting ? (
                    <button
                      onClick={() => handleVoidTicket(t.id)}
                      disabled={voidingId === t.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-black bg-white hover:bg-red-50 text-red-700 border border-red-300 disabled:opacity-60 transition-all"
                    >
                      {voidingId === t.id ? 'Voiding...' : 'Void'}
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-slate-400 italic px-2">
                      Already called - cannot void
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily Reset Button */}
      <div className="pt-2">
        <button
          onClick={() => setIsResetModalOpen(true)}
          className="w-full py-4 px-4 rounded-2xl bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-950 border border-slate-300 hover:border-amber-400 font-black text-sm sm:text-base flex items-center justify-center space-x-2 transition-all shadow-sm"
        >
          <RotateCcw className="w-5 h-5 text-amber-600" />
          <span>Start New Day / Reset Numbers to 001</span>
        </button>
      </div>

      {/* Ticket Print Modal */}
      <TicketPrintModal
        ticket={createdTicket}
        onClose={() => setCreatedTicket(null)}
        isBluetoothConnected={bluetoothConnected}
        onConnectBluetooth={handleConnectBluetooth}
        onVoid={handleVoidTicket}
      />

      {/* Reset Confirmation Modal */}
      <ResetConfirmModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleConfirmReset}
        isResetting={isResetting}
      />
    </div>
  );
};
