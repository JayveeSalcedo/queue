import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRightLeft, CheckCircle, HandHelping, ChevronRight, MoreHorizontal, Pause, Play as PlayIcon, SkipForward, UserX, Volume2 } from 'lucide-react';
import { useQueue } from '../context/QueueContext';
import { useConfirm } from '../context/ConfirmContext';
import { useCounterControl } from '../hooks/useCounterControl';
import { QUEUE_META } from '../queueStyles';
import { QueueType } from '../types';

/**
 * Compact counter controller: a small wide strip with only the buttons used
 * all day. The customer being served is shown in the window title (and so on
 * the taskbar) and on the Complete button; the waiting count is on Next.
 * Rarer actions (transfer several customers to another line, no-show) are in the ⋯ menu.
 * The waiting list and on-hold list live on the full page.
 */
export const CounterMiniPage: React.FC = () => {
  const confirm = useConfirm();
  const { id } = useParams<{ id: string }>();
  const counterId = id ? parseInt(id, 10) || 1 : 1;
  const { isConnected } = useQueue();
  const c = useCounterControl(counterId);
  const serving = c.currentTicket?.queue_number ?? null;

  // 'main' = the buttons, 'transfer' = pick customers and a line, 'help' = take from another line. The ⋯ menu floats over the buttons.
  const [view, setView] = useState<'main' | 'transfer' | 'help'>('main');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const openTransfer = () => {
    setMenuOpen(false);
    // Most often it is the customer at the counter who came to the wrong place
    setSelected(new Set(c.currentTicket ? [c.currentTicket.id] : []));
    setView('transfer');
  };
  const toggle = (tid: number) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });
  const sendTo = async (target: QueueType) => {
    await c.transferMany([...selected], target);
    setView('main');
  };
  const openHelp = () => {
    setMenuOpen(false);
    setView('help');
  };
  const takeFrom = async (q: QueueType) => {
    await c.takeFrom(q);
    setView('main');
  };
  const noShow = async () => {
    setMenuOpen(false);
    if (!serving) return;
    const ok = await confirm({
      title: `Mark ${serving} as a no-show?`,
      message: 'They will not be called again.',
      confirmLabel: 'Mark no-show',
      tone: 'danger',
    });
    if (!ok) return;
    c.noShowCurrent();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setView('main');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    <div className="h-screen bg-slate-50 flex flex-col gap-1 p-2 select-none overflow-hidden relative">
      {view === 'help' ? (
        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-slate-900">
              Take the next customer from <span className="font-normal text-slate-500">another line</span>
            </span>
            <button onClick={() => setView('main')} className="text-xs font-medium px-2 py-0.5 rounded bg-slate-200 text-slate-800 hover:bg-slate-300">
              Cancel
            </button>
          </div>
          <div className="flex-1 min-h-0 flex gap-2">
            {(['REGULAR', 'PRIORITY', 'COMPLAINT'] as QueueType[])
              .filter((q) => q !== c.counter.queue_type)
              .map((q) => {
                const n = c.waitingCounts[q] || 0;
                return (
                  <button
                    key={q}
                    onClick={() => takeFrom(q)}
                    disabled={c.isBusy || n === 0}
                    className={`btn btn-secondary ${tile} flex-1 ${QUEUE_META[q].chip}`}
                  >
                    <span className="text-sm font-semibold">{QUEUE_META[q].label}</span>
                    <span className="text-[11px] font-medium tabular-nums">{n === 0 ? 'nobody waiting' : `${n} waiting`}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ) : view === 'transfer' ? (
        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-slate-900">
              Transfer customers <span className="font-normal text-slate-500">({selected.size} selected)</span>
            </span>
            <span className="flex items-center gap-1">
              <button
                onClick={() => setSelected(new Set(c.transferable.map((t) => t.id)))}
                className="text-xs text-emerald-700 font-medium px-1.5 py-0.5 rounded hover:bg-emerald-50"
              >
                All
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-slate-600 font-medium px-1.5 py-0.5 rounded hover:bg-slate-100"
              >
                None
              </button>
              <button onClick={() => setView('main')} className="text-xs font-medium px-2 py-0.5 rounded bg-slate-200 text-slate-800 hover:bg-slate-300">
                Cancel
              </button>
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-wrap content-start gap-1">
            {c.transferable.length === 0 ? (
              <span className="text-sm text-slate-500 py-1">No customers to transfer.</span>
            ) : (
              c.transferable.map((t) => {
                const on = selected.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    aria-pressed={on}
                    title={t.serving ? 'At the counter now' : 'Waiting'}
                    className={`px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 ring-inset ${
                      on ? 'bg-emerald-700 text-white ring-emerald-700' : QUEUE_META[t.queue_type].chip
                    }`}
                  >
                    {on ? '✓ ' : ''}
                    {t.queue_number}
                    {t.serving ? ' · now' : ''}
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-600 shrink-0">Send to</span>
            {(['REGULAR', 'PRIORITY', 'COMPLAINT'] as QueueType[]).map((q) => (
              <button
                key={q}
                onClick={() => sendTo(q)}
                disabled={c.isBusy || selected.size === 0}
                className={`btn btn-secondary flex-1 py-1.5 text-xs ${QUEUE_META[q].chip}`}
              >
                {QUEUE_META[q].label}
              </button>
            ))}
          </div>
        </div>
      ) : (
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

        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="More: transfer customers, take from another line, no-show"
          className={`btn btn-secondary ${tile} flex-[0.7]`}
        >
          <MoreHorizontal className={`w-5 h-5 text-slate-500 ${icon}`} />
          <span>More</span>
        </button>
      </div>
      )}

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div role="menu" className="absolute z-20 right-2 bottom-8 w-60 rounded-xl bg-white shadow-lg ring-1 ring-slate-200 p-1">
            <button
              role="menuitem"
              onClick={openTransfer}
              disabled={c.transferable.length === 0}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left text-slate-800 hover:bg-slate-100 disabled:opacity-40"
            >
              <ArrowRightLeft className="w-4 h-4 text-slate-500" />
              Transfer customers…
            </button>
            <button
              role="menuitem"
              onClick={openHelp}
              disabled={c.isPaused || !!serving}
              title={serving ? 'Complete or skip the customer at your counter first' : 'Take the next customer from another line'}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left text-slate-800 hover:bg-slate-100 disabled:opacity-40"
            >
              <HandHelping className="w-4 h-4 text-slate-500" />
              Take from another line…
            </button>
            <button
              role="menuitem"
              onClick={noShow}
              disabled={!serving}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left text-slate-800 hover:bg-slate-100 disabled:opacity-40"
            >
              <UserX className="w-4 h-4 text-slate-500" />
              {serving ? `No-show: ${serving}` : 'No-show'}
            </button>
          </div>
        </>
      )}

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
