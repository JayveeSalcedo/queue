import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { QueueType } from '../types';
import { api } from '../services/api';
import { useQueue } from '../context/QueueContext';
import { TransferModal } from '../components/TransferModal';
import { 
  Play, 
  Volume2, 
  SkipForward, 
  CheckCircle, 
  ArrowRightLeft, 
  Clock, 
  Users, 
  PhoneCall,
  ListOrdered,
  Pause,
  Play as PlayIcon,
  LifeBuoy
} from 'lucide-react';

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

  const serviceTitle =
    activeCounter.queue_type === 'REGULAR'
      ? 'Regular Queue'
      : activeCounter.queue_type === 'PRIORITY'
      ? 'Priority Queue (Seniors, PWD, Pregnant)'
      : 'Request / Complaint Queue';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Station Title Header (Simple & Direct) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 mb-6 border-b border-slate-200 gap-2">
        <div>
          <h1 className="text-3xl font-black text-emerald-950 tracking-tight">
            {activeCounter.name}
          </h1>
          <p className="text-sm font-semibold text-slate-500">
            {serviceTitle}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-4 py-2 rounded-2xl bg-amber-100 text-amber-950 font-black text-sm flex items-center space-x-2 border border-amber-300">
            <Users className="w-4 h-4 text-amber-700" />
            <span>{currentQueueWaiting} In Line</span>
          </span>

          {/* Pause is offered only where another counter can cover (R and P) */}
          {inCoverGroup && (
            <button
              onClick={handleTogglePause}
              disabled={isTogglingPause}
              className={`px-4 py-2 rounded-2xl font-black text-sm flex items-center space-x-2 border-2 transition-all disabled:opacity-60 ${
                isPaused
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-900 shadow-md'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
              title={
                isPaused
                  ? 'Resume taking customers at this counter'
                  : 'Pause this counter - waiting customers go to the other counter'
              }
            >
              {isPaused ? <PlayIcon className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              <span>
                {isTogglingPause ? 'Saving...' : isPaused ? 'RESUME COUNTER' : 'PAUSE COUNTER'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Paused banner - this counter is closed, customers are being covered */}
      {isPaused && (
        <div className="mb-6 rounded-3xl border-3 border-amber-400 bg-amber-50 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400 text-amber-950 flex items-center justify-center shadow-sm">
              <Pause className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-amber-950">This counter is PAUSED</h2>
              <p className="text-sm font-semibold text-amber-900">
                {coveredBy
                  ? `Waiting ${activeCounter.queue_type} customers are being called by ${coveredBy.name}.`
                  : 'Waiting customers are held until a counter is available.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleTogglePause}
            disabled={isTogglingPause}
            className="px-5 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm flex items-center space-x-2 shadow-md disabled:opacity-60"
          >
            <PlayIcon className="w-4 h-4" />
            <span>Resume Counter</span>
          </button>
        </div>
      )}

      {/* Covering banner - this counter is absorbing a paused counter's queue */}
      {coveringFor.length > 0 && (
        <div className="mb-6 rounded-3xl border-2 border-emerald-400 bg-emerald-50 p-4 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-700 text-amber-300 flex items-center justify-center shadow-sm shrink-0">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-emerald-950 uppercase tracking-wider">
              Covering for {coveringFor.map((c) => c.name).join(' & ')}
            </h2>
            <p className="text-xs font-semibold text-emerald-900">
              NEXT CUSTOMER also calls{' '}
              {coveringFor.map((c) => c.queue_type).join(' & ')} tickets
              {servableQueueTypes.includes('PRIORITY') && servableQueueTypes.length > 1
                ? ' - priority customers are called first.'
                : '.'}
            </p>
          </div>
        </div>
      )}

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT AREA: Serving Station (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Serving Card */}
          <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border-3 border-emerald-800 text-center">
            {/* "NOW SERVING" Header */}
            <span className="text-sm sm:text-base font-extrabold text-slate-400 uppercase tracking-widest block mb-2">
              NOW SERVING
            </span>

            {/* Giant Ticket Number Display */}
            <div className="my-6 sm:my-8">
              {currentTicket ? (
                <div className="space-y-2">
                  <div className="text-8xl sm:text-9xl font-black text-emerald-950 font-mono tracking-tight select-all">
                    {currentTicket.queue_number}
                  </div>
                  <div className="text-sm text-slate-500 font-semibold">
                    Called at {currentTicket.called_at?.split(' ')[1] || 'Just now'}
                  </div>
                </div>
              ) : (
                <div className="py-12 sm:py-16 text-slate-300 font-black text-3xl sm:text-4xl">
                  [ No Active Customer ]
                </div>
              )}
            </div>

            {/* BIGGER "NEXT CUSTOMER" PRIMARY BUTTON */}
            <div className="mb-8">
              <button
                onClick={handleCallNext}
                disabled={isProcessing || isPaused}
                className={`w-full py-7 sm:py-9 px-8 rounded-3xl font-black text-3xl sm:text-4xl shadow-2xl transition-all flex items-center justify-center space-x-4 border-4 ${
                  isPaused
                    ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed'
                    : 'bg-emerald-700 hover:bg-emerald-600 text-white border-amber-400 active:scale-98 cursor-pointer'
                }`}
              >
                {isPaused ? (
                  <>
                    <Pause className="w-10 h-10" />
                    <span className="tracking-wide">COUNTER PAUSED</span>
                  </>
                ) : (
                  <>
                    <Play className="w-10 h-10 text-amber-300 fill-amber-300" />
                    <span className="tracking-wide">NEXT CUSTOMER</span>
                  </>
                )}
              </button>
            </div>

            {/* MUCH BIGGER ACTION BUTTONS */}
            {currentTicket && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t-2 border-slate-100">
                {/* RECALL */}
                <button
                  onClick={handleRecall}
                  disabled={isProcessing}
                  className="py-5 px-4 rounded-2xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-black text-base sm:text-lg flex items-center justify-center space-x-2 transition-all border-2 border-amber-300 shadow-md active:scale-95"
                >
                  <Volume2 className="w-6 h-6 text-amber-700" />
                  <span>RECALL</span>
                </button>

                {/* SKIP */}
                <button
                  onClick={handleSkip}
                  disabled={isProcessing}
                  className="py-5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-base sm:text-lg flex items-center justify-center space-x-2 transition-all border-2 border-slate-300 shadow-md active:scale-95"
                >
                  <SkipForward className="w-6 h-6 text-slate-600" />
                  <span>SKIP</span>
                </button>

                {/* COMPLETE */}
                <button
                  onClick={handleComplete}
                  disabled={isProcessing}
                  className="py-5 px-4 rounded-2xl bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-black text-base sm:text-lg flex items-center justify-center space-x-2 transition-all border-2 border-emerald-400 shadow-md active:scale-95"
                >
                  <CheckCircle className="w-6 h-6 text-emerald-700" />
                  <span>COMPLETE</span>
                </button>

                {/* TRANSFER */}
                <button
                  onClick={() => {
                    setTransferTicketId(currentTicket.id);
                    setIsTransferModalOpen(true);
                  }}
                  disabled={isProcessing}
                  className="py-5 px-4 rounded-2xl bg-purple-100 hover:bg-purple-200 text-purple-950 font-black text-base sm:text-lg flex items-center justify-center space-x-2 transition-all border-2 border-purple-300 shadow-md active:scale-95"
                >
                  <ArrowRightLeft className="w-6 h-6 text-purple-700" />
                  <span>TRANSFER</span>
                </button>
              </div>
            )}
          </div>

          {/* Skipped / On-Hold Customers for this Counter */}
          {mySkippedTickets.length > 0 && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center space-x-2 mb-4">
                <Clock className="w-5 h-5 text-amber-600" />
                <span>On-Hold / Skipped Customers ({mySkippedTickets.length})</span>
              </h3>

              <div className="divide-y divide-slate-100">
                {mySkippedTickets.map((t) => (
                  <div key={t.id} className="py-3.5 flex items-center justify-between">
                    <span className="font-mono font-black text-2xl text-emerald-950">
                      {t.queue_number}
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleRecallSkipped(t.id)}
                        disabled={isProcessing}
                        className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm shadow-sm"
                      >
                        Call Back
                      </button>
                      <button
                        onClick={() => handleMarkNoShow(t.id)}
                        disabled={isProcessing}
                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-red-100 text-slate-700 hover:text-red-700 font-bold text-sm border border-slate-200"
                      >
                        No Show
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT AREA: WAITING QUEUE LIST ON SIDE (4 cols) */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-3xl p-6 shadow-xl border-2 border-emerald-700">
            {/* Panel Header */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <ListOrdered className="w-6 h-6 text-emerald-700" />
                <h2 className="text-xl font-black text-emerald-950">Waiting List</h2>
              </div>
              <span className="px-3.5 py-1 rounded-full bg-amber-400 text-emerald-950 font-black text-sm">
                {myQueueWaitingTickets.length}
              </span>
            </div>

            {/* Simple Clean List */}
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
              {myQueueWaitingTickets.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <Users className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-base font-bold text-slate-500">Queue is empty</p>
                  <p className="text-xs text-slate-400">New tickets issued by the Guard will appear here.</p>
                </div>
              ) : (
                myQueueWaitingTickets.map((ticket, index) => {
                  const isTopTicket = index === 0;

                  return (
                    <div
                      key={ticket.id}
                      className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${
                        isTopTicket
                          ? 'bg-amber-50 border-amber-400 shadow-md ring-2 ring-amber-400/20'
                          : 'bg-slate-50 hover:bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-sm font-bold text-slate-400">
                          #{index + 1}
                        </span>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-3xl font-black font-mono text-emerald-950">
                              {ticket.queue_number}
                            </span>
                            {isTopTicket && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-emerald-950 text-[10px] font-black uppercase tracking-wider">
                                Next
                              </span>
                            )}
                            {ticket.queue_type !== activeCounter.queue_type && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-700 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                                Covering {ticket.queue_type}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 font-semibold block">
                            Issued {ticket.created_at?.split(' ')[1] || ''}
                          </span>
                        </div>
                      </div>

                      {/* Direct Call Button */}
                      <button
                        onClick={() => handleCallSpecificTicket(ticket.id)}
                        disabled={isProcessing}
                        className="py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm flex items-center space-x-1.5 shadow-sm active:scale-95 transition-all"
                        title={`Call ${ticket.queue_number} now`}
                      >
                        <PhoneCall className="w-4 h-4 text-amber-300" />
                        <span>Call</span>
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
