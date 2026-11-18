import React, { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CheckCircle,
  ChevronRight,
  Maximize2,
  Pause,
  Play as PlayIcon,
  SkipForward,
  Users,
  Volume2,
} from 'lucide-react';
import { useQueue } from '../context/QueueContext';
import { useCounterControl } from '../hooks/useCounterControl';
import { QUEUE_META, formatTime } from '../queueStyles';

/**
 * Compact counter controller for a small always-handy window (about 360x560):
 * the number being served and the buttons staff press all day. Anything
 * rarer (transfer, the waiting list, on-hold customers) lives on the full page.
 */
export const CounterMiniPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const counterId = id ? parseInt(id, 10) || 1 : 1;
  const { isConnected } = useQueue();
  const c = useCounterControl(counterId);
  const meta = QUEUE_META[c.counter.queue_type];

  // The taskbar shows the title, so staff can see who is being served at a glance
  useEffect(() => {
    document.title = c.currentTicket
      ? `${c.currentTicket.queue_number} · ${c.counter.name}`
      : `${c.counter.name} · idle`;
  }, [c.currentTicket, c.counter.name]);

  const coveringText = c.covering.length
    ? `Also calling ${c.covering.map((x) => QUEUE_META[x.queue_type].label.toLowerCase()).join(' & ')}`
    : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col p-3 gap-3 select-none">
      {/* Title row */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}
              title={isConnected ? 'Connected' : 'Reconnecting…'}
            />
            <h1 className="text-base font-semibold text-slate-900 truncate">{c.counter.name}</h1>
            <span className={`badge ${meta.chip}`}>{meta.label}</span>
          </div>
        </div>
        <Link
          to={`/counter/${counterId}`}
          target="_blank"
          title="Open the full counter page"
          className="btn btn-ghost btn-sm p-1.5 shrink-0"
          onClick={(e) => {
            // Inside the always-on-top QueueMini app a new tab has nowhere to open:
            // ask the app to open the normal browser instead
            const bridge = (window as unknown as { pywebview?: { api?: { open_full?: (p: string) => void } } }).pywebview;
            if (bridge?.api?.open_full) {
              e.preventDefault();
              bridge.api.open_full(`/counter/${counterId}`);
            }
          }}
        >
          <Maximize2 className="w-4 h-4" />
        </Link>
      </div>

      {!isConnected && (
        <div className="rounded-lg bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 px-3 py-2 text-xs">
          Lost connection to the queue server. Reconnecting…
        </div>
      )}

      {/* Now serving */}
      <div className="card px-4 py-5 text-center">
        {c.isPaused ? (
          <>
            <div className="eyebrow text-amber-600">Counter paused</div>
            <div className="mt-2 text-3xl font-semibold text-slate-300">Closed</div>
            <p className="mt-1 text-xs text-slate-500">Waiting customers go to the other counter.</p>
          </>
        ) : (
          <>
            <div className="eyebrow">Now serving</div>
            {c.currentTicket ? (
              <>
                <div className="ticket-no text-6xl text-slate-900 mt-1 select-all">{c.currentTicket.queue_number}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Called at {formatTime(c.currentTicket.called_at) || 'just now'}
                </div>
              </>
            ) : (
              <div className="py-3">
                <div className="text-3xl font-semibold text-slate-300">—</div>
                <div className="text-xs text-slate-500 mt-1">No customer at the counter</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* The one button used most */}
      <button
        onClick={c.callNext}
        disabled={c.isBusy || c.isPaused}
        className="btn btn-primary text-lg py-4 rounded-xl"
      >
        {c.isPaused ? (
          'Counter paused'
        ) : (
          <>
            Next customer
            <ChevronRight className="w-5 h-5" />
          </>
        )}
      </button>

      {/* Actions on the customer at the counter */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={c.complete} disabled={c.isBusy || !c.currentTicket} className="btn btn-secondary flex-col gap-1 py-3">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          Complete
        </button>
        <button onClick={c.recall} disabled={c.isBusy || !c.currentTicket} className="btn btn-secondary flex-col gap-1 py-3">
          <Volume2 className="w-5 h-5 text-slate-500" />
          Recall
        </button>
        <button onClick={c.skip} disabled={c.isBusy || !c.currentTicket} className="btn btn-secondary flex-col gap-1 py-3">
          <SkipForward className="w-5 h-5 text-slate-500" />
          Skip
        </button>
      </div>

      {c.inCoverGroup && (
        <button
          onClick={c.togglePause}
          disabled={c.isBusy}
          className={`btn ${c.isPaused ? 'btn-primary' : 'btn-secondary'}`}
          title={c.isPaused ? 'Resume taking customers' : 'Pause: waiting customers go to the other counter'}
        >
          {c.isPaused ? <PlayIcon className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          {c.isPaused ? 'Resume counter' : 'Pause counter'}
        </button>
      )}

      {/* Status line: messages and errors appear here instead of pop-up alerts */}
      <div className="mt-auto space-y-2">
        {c.notice && (
          <div
            role={c.notice.kind === 'error' ? 'alert' : 'status'}
            className={`rounded-lg px-3 py-2 text-xs ring-1 ring-inset ${
              c.notice.kind === 'error'
                ? 'bg-red-50 text-red-700 ring-red-200'
                : 'bg-emerald-50 text-emerald-800 ring-emerald-200'
            }`}
          >
            {c.notice.text}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span className="inline-flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span className="font-semibold text-slate-700 tabular-nums">{c.waiting}</span> waiting
          </span>
          {coveringText && <span className="text-emerald-700">{coveringText}</span>}
        </div>
      </div>
    </div>
  );
};
