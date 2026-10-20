import React, { useState } from 'react';
import { QueueType, Ticket } from '../types';
import { api } from '../services/api';
import { useQueue } from '../context/QueueContext';
import { thermalPrinterService } from '../services/printer';
import { TicketPrintModal } from '../components/TicketPrintModal';
import { ResetConfirmModal } from '../components/ResetConfirmModal';
import { QUEUE_META, formatTime } from '../queueStyles';
import {
  RotateCcw,
  Bluetooth,
  ChevronDown,
  ChevronRight,
  Info
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

  const prefixes: Record<QueueType, string> = {
    REGULAR: settings.regular_prefix || 'R',
    PRIORITY: settings.priority_prefix || 'P',
    COMPLAINT: settings.complaint_prefix || 'C',
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
      {/* Station Header & Bluetooth Printer Status */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Issue a ticket</h1>
          <p className="page-subtitle">Tap the customer's service to print their number.</p>
        </div>

        <button
          onClick={handleConnectBluetooth}
          className={`btn btn-sm shrink-0 ${
            bluetoothConnected
              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
              : 'btn-secondary'
          }`}
          title={bluetoothConnected ? 'Printer connected' : 'Connect a 58mm Bluetooth printer'}
        >
          <Bluetooth className="w-4 h-4" />
          <span className="max-w-[8rem] truncate">
            {bluetoothConnected ? printerDeviceName || 'Printer ready' : 'Connect printer'}
          </span>
        </button>
      </div>

      {/* 1-Tap Generation Buttons */}
      <div className="space-y-3">
        {(['REGULAR', 'PRIORITY', 'COMPLAINT'] as QueueType[]).map((q) => {
          const meta = QUEUE_META[q];
          return (
            <button
              key={q}
              onClick={() => handleGenerateTicket(q)}
              disabled={isGenerating}
              className="card w-full p-4 sm:p-5 flex items-center gap-4 text-left cursor-pointer hover:border-slate-300 hover:shadow-md active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <div
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center text-2xl sm:text-3xl font-bold shrink-0 ${meta.solid}`}
              >
                {prefixes[q]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg sm:text-xl font-semibold text-slate-900">{meta.label}</div>
                <div className="text-sm text-slate-500 truncate">
                  {meta.counter} · {meta.description}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-semibold tabular-nums text-slate-900">{waitingCounts[q]}</div>
                <div className="text-xs text-slate-500">waiting</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* In-queue list for the guard */}
      <div className="card">
        <button
          onClick={() => setShowQueueList(!showQueueList)}
          className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer"
        >
          <div>
            <div className="card-title">Customers in line</div>
            <div className="text-xs text-slate-500 mt-0.5">{waitingCounts.TOTAL} waiting across all counters</div>
          </div>
          {showQueueList ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {showQueueList && (
          <div className="border-t border-slate-200 max-h-72 overflow-y-auto divide-y divide-slate-100">
            {waitingTickets.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No customers waiting.</p>
            ) : (
              waitingTickets.map((t) => (
                <div key={t.id} className="px-5 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="ticket-no text-base text-slate-900 w-16">{t.queue_number}</span>
                    <span className={`badge ${QUEUE_META[t.queue_type].chip}`}>{QUEUE_META[t.queue_type].label}</span>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">{formatTime(t.created_at)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Undo strip: tickets issued from this phone, voidable while still waiting */}
      {(issuedThisSession.length > 0 || voidNotice) && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Issued from this device</div>
              <div className="text-xs text-slate-500 mt-0.5">Void a ticket printed by mistake.</div>
            </div>
          </div>

          {voidNotice && (
            <div className="mx-5 mt-4 flex items-start gap-2 text-sm px-3 py-2 rounded-lg bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{voidNotice}</span>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {issuedThisSession.map((t) => {
              const stillWaiting = (waitingTickets || []).some((w) => w.id === t.id);
              return (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="ticket-no text-base text-slate-900">{t.queue_number}</span>
                    <span className="text-xs text-slate-500">{t.time_formatted || ''}</span>
                  </div>

                  {stillWaiting ? (
                    <button
                      onClick={() => handleVoidTicket(t.id)}
                      disabled={voidingId === t.id}
                      className="btn btn-danger-outline btn-sm"
                    >
                      {voidingId === t.id ? 'Voiding…' : 'Void'}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Already called</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily Reset */}
      <div className="pt-2">
        <button onClick={() => setIsResetModalOpen(true)} className="btn btn-secondary w-full py-3">
          <RotateCcw className="w-4 h-4" />
          Start new day (reset numbers to 001)
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
