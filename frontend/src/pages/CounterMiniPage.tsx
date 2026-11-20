import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, ChevronRight, Pause, Play as PlayIcon, SkipForward, Volume2 } from 'lucide-react';
import { useQueue } from '../context/QueueContext';
import { useCounterControl } from '../hooks/useCounterControl';

/**
 * Compact counter controller: a small wide strip with only the buttons used
 * all day. The customer being served is shown in the window title (and so on
 * the taskbar) and on the Complete button; the waiting count is on Next.
 * Anything rarer (transfer, waiting list, on-hold) lives on the full page.
 */
export const CounterMiniPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const counterId = id ? parseInt(id, 10) || 1 : 1;
  const { isConnected } = useQueue();
  const c = useCounterControl(counterId);
  const serving = c.currentTicket?.queue_number ?? null;

  useEffect(() => {
    document.title = serving ? `${serving} · ${c.counter.name}` : `${c.counter.name} · idle`;
  }, [serving, c.counter.name]);

  // One line under the buttons: a message, an error, or lost connection
  const status = !isConnected
    ? { kind: 'error' as const, text: 'Lost connection to the queue server. Reconnecting…' }
    : c.notice;

  const tile = 'h-full flex-col gap-0.5 rounded-xl px-1 leading-tight';
  // In a very short window drop the icons and keep the labels readable
  const icon = '[@media(max-height:118px)]:hidden';

  return (
    <div className="h-screen bg-slate-50 flex flex-col gap-1 p-2 select-none overflow-hidden">
      <div className="flex-1 min-h-0 flex gap-2">
        <button
          onClick={c.callNext}
          disabled={c.isBusy || c.isPaused}
          className={`btn btn-primary ${tile} flex-[1.8]`}
        >
          <span className="inline-flex items-center gap-1 text-base">
            {c.isPaused ? 'Paused' : 'Next'}
            {!c.isPaused && <ChevronRight className="w-4 h-4" />}
          </span>
          <span className="text-[11px] font-medium text-emerald-100">{c.waiting} waiting</span>
        </button>

        <button onClick={c.complete} disabled={c.isBusy || !serving} className={`btn btn-secondary ${tile} flex-1`}>
          <CheckCircle className={`w-5 h-5 text-emerald-600 ${icon}`} />
          <span>Complete</span>
          <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{serving ?? '—'}</span>
        </button>

        <button onClick={c.recall} disabled={c.isBusy || !serving} className={`btn btn-secondary ${tile} flex-1`}>
          <Volume2 className={`w-5 h-5 text-slate-500 ${icon}`} />
          <span>Recall</span>
        </button>

        <button onClick={c.skip} disabled={c.isBusy || !serving} className={`btn btn-secondary ${tile} flex-1`}>
          <SkipForward className={`w-5 h-5 text-slate-500 ${icon}`} />
          <span>Skip</span>
        </button>

        {c.inCoverGroup && (
          <button
            onClick={c.togglePause}
            disabled={c.isBusy}
            className={`btn ${c.isPaused ? 'btn-primary' : 'btn-secondary'} ${tile} flex-1`}
            title={c.isPaused ? 'Resume taking customers' : 'Pause: waiting customers go to the other counter'}
          >
            {c.isPaused ? <PlayIcon className={`w-5 h-5 ${icon}`} /> : <Pause className={`w-5 h-5 text-slate-500 ${icon}`} />}
            <span>{c.isPaused ? 'Resume' : 'Pause'}</span>
          </button>
        )}
      </div>

      <div
        role={status?.kind === 'error' ? 'alert' : 'status'}
        className={`h-5 shrink-0 px-1 text-xs truncate leading-5 ${
          status?.kind === 'error' ? 'text-red-700' : 'text-emerald-700'
        }`}
      >
        {status?.text ?? ''}
      </div>
    </div>
  );
};
