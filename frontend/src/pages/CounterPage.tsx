import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { QueueType } from '../types';
import { api } from '../services/api';
import { useQueue } from '../context/QueueContext';
import { TransferModal } from '../components/TransferModal';
import { QUEUE_META, formatTime } from '../queueStyles';
import {
  Volume2,
  SkipForward,
  CheckCircle,
  ArrowRightLeft,
  Users,
  Pause,
  Play as PlayIcon,
  LifeBuoy,
  ChevronRight,
  PictureInPicture2
} from 'lucide-react';
import { openMiniWindow } from '../services/miniWindow';

export const CounterPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const counterId = id ? parseInt(id) : 1;

  const { counters, waitingCounts, waitingTickets, skippedTickets, refreshState } = useQueue();

  const [isProcessing, setIsProcessing] = useState(false);
  const [transferTicketId, setTransferTicketId] = useState<number | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);

  // Strictly bind to the opened counter
  const activeCounter = counters.find((c) => c.id === counterId) || {
    id: counterId,
    name: `Counter ${counterId}`,
    queue_type: (counterId === 2 ? 'PRIORITY' : counterId === 3 ? 'COMPLAINT' : 'REGULAR') as QueueType,
    status: 'ACTIVE' as const,
    current_ticket: null,
  };

  // Counters 1 (Regular) and 2 (Priority) cover for each other. Counter 3
  // (Complaint) is never paused and never absorbs another queue.
  const COVER_GROUP: QueueType[] = ['REGULAR', 'PRIORITY'];
  const inCoverGroup = COVER_GROUP.includes(activeCounter.queue_type);
  const isPaused = activeCounter.status === 'PAUSED';

  // Queues this counter is currently covering for a paused partner
  const coveringFor = inCoverGroup && !isPaused
    ? counters.filter(
        (c) =>
          c.id !== counterId &&
          c.status === 'PAUSED' &&
          COVER_GROUP.includes(c.queue_type)
      )
    : [];

  const servableQueueTypes: QueueType[] = [
    activeCounter.queue_type,
    ...coveringFor.map((c) => c.queue_type),
  ];

  // Where this counter's customers go while it is paused
  const coveredBy = isPaused
    ? counters.find(
        (c) =>
          c.id !== counterId &&
          c.status === 'ACTIVE' &&
          COVER_GROUP.includes(c.queue_type)
      )
    : undefined;

  const handleTogglePause = async () => {
    setIsTogglingPause(true);
    try {
      await api.setCounterStatus(counterId, isPaused ? 'ACTIVE' : 'PAUSED');
      await refreshState();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsTogglingPause(false);
    }
  };

  const handleCallNext = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const res = await api.callNext(counterId);
      if (!res.ticket) {
        alert('No customers are currently waiting in this queue.');
      }
      await refreshState();
    } catch (err: any) {
      alert('Error calling next ticket: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCallSpecificTicket = async (ticketId: number) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await api.callTicket(counterId, ticketId);
      await refreshState();
    } catch (err: any) {
      alert('Error calling ticket: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecall = async () => {
    if (isProcessing || !activeCounter?.current_ticket) return;
    setIsProcessing(true);
    try {
      await api.recall(counterId);
    } catch (err: any) {
      alert('Error recalling ticket: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkip = async () => {
    if (isProcessing || !activeCounter?.current_ticket) return;
    setIsProcessing(true);
    try {
      await api.skip(counterId);
      await refreshState();
    } catch (err: any) {
      alert('Error skipping ticket: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleComplete = async () => {
    if (isProcessing || !activeCounter?.current_ticket) return;
    setIsProcessing(true);
    try {
      await api.complete(counterId);
      await refreshState();
    } catch (err: any) {
      alert('Error completing ticket: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecallSkipped = async (ticketId: number) => {
    setIsProcessing(true);
    try {
      await api.recallSkipped(counterId, ticketId);
      await refreshState();
    } catch (err: any) {
      alert('Error recalling skipped ticket: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkNoShow = async (ticketId: number) => {
    if (!confirm('Mark ticket as No Show (Cancel)?')) return;
    setIsProcessing(true);
    try {
      await api.markNoShow(counterId, ticketId);
      await refreshState();
    } catch (err: any) {
      alert('Error marking no show: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTransfer = async (targetQueue: QueueType, notes?: string) => {
    if (!transferTicketId) return;
    setIsProcessing(true);
    try {
      await api.transfer(counterId, transferTicketId, targetQueue, notes);
      setIsTransferModalOpen(false);
      setTransferTicketId(null);
      await refreshState();
    } catch (err: any) {
      alert('Transfer failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const currentTicket = activeCounter?.current_ticket;
  
  // Counts and lists span this counter's own queue plus anything it covers
  const currentQueueWaiting = servableQueueTypes.reduce(
    (total, q) => total + (waitingCounts[q] || 0),
    0
  );

  // Priority first when covering both, mirroring the server's call order
  const myQueueWaitingTickets = (waitingTickets || [])
    .filter((t) => servableQueueTypes.includes(t.queue_type))
    .sort((a, b) => {
      if (a.queue_type !== b.queue_type) {
        if (a.queue_type === 'PRIORITY') return -1;
        if (b.queue_type === 'PRIORITY') return 1;
      }
      return a.number_seq - b.number_seq;
    });

  // Show skipped tickets for this counter
  const mySkippedTickets = (skippedTickets || []).filter(
    (t) => t.counter_id === counterId || t.queue_type === activeCounter.queue_type
  );

  const meta = QUEUE_META[activeCounter.queue_type];

  return (
    <div className="page">
      {/* Station header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">{activeCounter.name}</h1>
            <span className={`badge ${meta.chip}`}>{meta.label}</span>
            {isPaused && (
              <span className="badge bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200">Paused</span>
            )}
          </div>
          <p className="page-subtitle">{meta.description}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Small floating window with just the buttons used all day */}
          <button
            onClick={() => {
              if (!openMiniWindow(counterId)) {
                alert('The pop-up was blocked. Allow pop-ups for this site in the address bar, then try again.');
              }
            }}
            className="btn btn-secondary btn-sm py-2"
            title="Open a small window with Next, Recall, Skip, Complete and Pause"
          >
            <PictureInPicture2 className="w-4 h-4" />
            Mini window
          </button>
          <span className="badge bg-white text-slate-700 ring-1 ring-inset ring-slate-200 px-3 py-1.5 text-sm">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="tabular-nums font-semibold">{currentQueueWaiting}</span> waiting
          </span>

          {/* Pause is offered only where another counter can cover (R and P);
              while paused, the banner below carries the Resume button */}
          {inCoverGroup && !isPaused && (
            <button
              onClick={handleTogglePause}
              disabled={isTogglingPause}
              className={`btn btn-sm py-2 ${isPaused ? 'btn-primary' : 'btn-secondary'}`}
              title={
                isPaused
                  ? 'Resume taking customers at this counter'
                  : 'Pause this counter - waiting customers go to the other counter'
              }
            >
              {isPaused ? <PlayIcon className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isTogglingPause ? 'Saving…' : isPaused ? 'Resume counter' : 'Pause counter'}
            </button>
          )}
        </div>
      </div>

      {/* Paused banner - this counter is closed, customers are being covered */}
      {isPaused && (
        <div className="mb-6 rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Pause className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-amber-900">This counter is paused</h2>
              <p className="text-sm text-amber-800">
                {coveredBy
                  ? `Waiting ${QUEUE_META[activeCounter.queue_type].label.toLowerCase()} customers are being called by ${coveredBy.name}.`
                  : 'Waiting customers are held until a counter is available.'}
              </p>
            </div>
          </div>
          <button onClick={handleTogglePause} disabled={isTogglingPause} className="btn btn-primary btn-sm py-2">
            <PlayIcon className="w-4 h-4" />
            Resume counter
          </button>
        </div>
      )}

      {/* Covering banner - this counter is absorbing a paused counter's queue */}
      {coveringFor.length > 0 && (
        <div className="mb-6 rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <LifeBuoy className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-emerald-900">
              Covering for {coveringFor.map((c) => c.name).join(' & ')}
            </h2>
            <p className="text-sm text-emerald-800">
              Next customer also calls {coveringFor.map((c) => QUEUE_META[c.queue_type].label.toLowerCase()).join(' & ')}{' '}
              tickets
              {servableQueueTypes.includes('PRIORITY') && servableQueueTypes.length > 1
                ? ' — priority customers are called first.'
                : '.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: Serving station */}
        <div className="lg:col-span-8 space-y-6">
          <div className="card overflow-hidden">
            <div className="px-6 sm:px-10 pt-8 pb-6 text-center">
              <span className="eyebrow">Now serving</span>

              {currentTicket ? (
                <div className="mt-3">
                  <div className="ticket-no text-7xl sm:text-8xl lg:text-9xl text-slate-900 select-all">
                    {currentTicket.queue_number}
                  </div>
                  <div className="mt-3 text-sm text-slate-500">
                    Called at {formatTime(currentTicket.called_at) || 'just now'}
                  </div>
                </div>
              ) : (
                <div className="py-10 sm:py-14">
                  <div className="text-2xl font-semibold text-slate-300">No customer at the counter</div>
                  <div className="mt-2 text-sm text-slate-500">
                    {isPaused ? 'Resume the counter to start calling.' : 'Press Next customer to call the next number.'}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 sm:px-10 pb-8">
              <button
                onClick={handleCallNext}
                disabled={isProcessing || isPaused}
                className="btn btn-primary w-full py-5 text-xl rounded-xl"
              >
                {isPaused ? (
                  <>
                    <Pause className="w-6 h-6" />
                    Counter paused
                  </>
                ) : (
                  <>
                    Next customer
                    <ChevronRight className="w-6 h-6" />
                  </>
                )}
              </button>
            </div>

            {currentTicket && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 sm:px-10 py-5 bg-slate-50 border-t border-slate-200">
                <button onClick={handleComplete} disabled={isProcessing} className="btn btn-secondary py-3.5">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  Complete
                </button>
                <button onClick={handleRecall} disabled={isProcessing} className="btn btn-secondary py-3.5">
                  <Volume2 className="w-5 h-5 text-slate-500" />
                  Recall
                </button>
                <button onClick={handleSkip} disabled={isProcessing} className="btn btn-secondary py-3.5">
                  <SkipForward className="w-5 h-5 text-slate-500" />
                  Skip
                </button>
                <button
                  onClick={() => {
                    setTransferTicketId(currentTicket.id);
                    setIsTransferModalOpen(true);
                  }}
                  disabled={isProcessing}
                  className="btn btn-secondary py-3.5"
                >
                  <ArrowRightLeft className="w-5 h-5 text-slate-500" />
                  Transfer
                </button>
              </div>
            )}
          </div>

          {/* Skipped / On-Hold Customers for this Counter */}
          {mySkippedTickets.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">On hold</div>
                  <div className="text-xs text-slate-500 mt-0.5">Skipped customers who may return.</div>
                </div>
                <span className="badge bg-slate-100 text-slate-700">{mySkippedTickets.length}</span>
              </div>

              <div className="divide-y divide-slate-100">
                {mySkippedTickets.map((t) => (
                  <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <span className="ticket-no text-xl text-slate-900">{t.queue_number}</span>
                      {t.called_at && (
                        <span className="ml-3 text-xs text-slate-500">Called {formatTime(t.called_at)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRecallSkipped(t.id)}
                        disabled={isProcessing}
                        className="btn btn-primary btn-sm py-2"
                      >
                        Call back
                      </button>
                      <button
                        onClick={() => handleMarkNoShow(t.id)}
                        disabled={isProcessing}
                        className="btn btn-secondary btn-sm py-2"
                      >
                        No show
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Waiting list */}
        <div className="lg:col-span-4">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Waiting list</div>
              <span className="badge bg-slate-100 text-slate-700 tabular-nums">{myQueueWaitingTickets.length}</span>
            </div>

            <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100">
              {myQueueWaitingTickets.length === 0 ? (
                <div className="py-14 px-6 text-center">
                  <Users className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-700">No one is waiting</p>
                  <p className="mt-1 text-xs text-slate-500">New tickets from the guard will appear here.</p>
                </div>
              ) : (
                myQueueWaitingTickets.map((ticket, index) => {
                  const isTopTicket = index === 0;
                  return (
                    <div
                      key={ticket.id}
                      className={`px-5 py-3 flex items-center justify-between gap-3 ${
                        isTopTicket ? 'bg-emerald-50/60' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-5 text-xs text-slate-400 tabular-nums text-right">{index + 1}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="ticket-no text-xl text-slate-900">{ticket.queue_number}</span>
                            {isTopTicket && (
                              <span className="badge bg-emerald-700 text-white">Next</span>
                            )}
                            {ticket.queue_type !== activeCounter.queue_type && (
                              <span className={`badge ${QUEUE_META[ticket.queue_type].chip}`}>
                                {QUEUE_META[ticket.queue_type].label}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500">Issued {formatTime(ticket.created_at)}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleCallSpecificTicket(ticket.id)}
                        disabled={isProcessing}
                        className="btn btn-secondary btn-sm py-2 shrink-0"
                        title={`Call ${ticket.queue_number} now`}
                      >
                        Call
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Modal */}
      <TransferModal
        isOpen={isTransferModalOpen}
        ticketNumber={currentTicket?.queue_number || ''}
        onClose={() => setIsTransferModalOpen(false)}
        onTransfer={handleTransfer}
        isTransferring={isProcessing}
      />
    </div>
  );
};
