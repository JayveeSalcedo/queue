import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { useQueue } from '../context/QueueContext';
import { Counter, QueueType } from '../types';

/** Counters 1 (Regular) and 2 (Priority) cover for each other while one is paused. */
const COVER_GROUP: QueueType[] = ['REGULAR', 'PRIORITY'];

export interface Notice {
  kind: 'info' | 'error';
  text: string;
}

/**
 * The everyday actions of one counter (call next, recall, skip, complete,
 * pause), shared by the compact pop-up window. Errors come back as a notice
 * to show inline rather than a blocking alert, which suits a tiny window.
 */
export function useCounterControl(counterId: number) {
  const { counters, waitingCounts, settings, refreshState } = useQueue();
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const counter: Counter =
    counters.find((c) => c.id === counterId) ??
    ({
      id: counterId,
      name: `Counter ${counterId}`,
      queue_type: counterId === 2 ? 'PRIORITY' : counterId === 3 ? 'COMPLAINT' : 'REGULAR',
      status: 'ACTIVE',
      current_ticket: null,
    } as Counter);

  const isPaused = counter.status === 'PAUSED';
  const inCoverGroup = COVER_GROUP.includes(counter.queue_type);
  const currentTicket = counter.current_ticket ?? null;

  // Queues this counter also serves because its partner is paused
  const covering = inCoverGroup && !isPaused
    ? counters.filter((c) => c.id !== counterId && c.status === 'PAUSED' && COVER_GROUP.includes(c.queue_type))
    : [];
  // With the "balance when both counters are open" option, Counter 1 and 2 draw from both lines
  const sharingBothLines =
    settings.priority_balance_always === 'true';
  const servable: QueueType[] =
    inCoverGroup && !isPaused && sharingBothLines
      ? [counter.queue_type, ...COVER_GROUP.filter((q) => q !== counter.queue_type)]
      : [counter.queue_type, ...covering.map((c) => c.queue_type)];
  const waiting = servable.reduce((total, q) => total + (waitingCounts[q] || 0), 0);

  const show = useCallback((n: Notice | null) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(n);
    if (n) noticeTimer.current = setTimeout(() => setNotice(null), n.kind === 'error' ? 8000 : 3500);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  // One action at a time, so a double click can't call two customers
  const run = useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      if (isBusy) return;
      setIsBusy(true);
      try {
        await action();
        show(success ? { kind: 'info', text: success } : null);
      } catch (err: any) {
        show({ kind: 'error', text: err?.message || 'Something went wrong.' });
      } finally {
        await refreshState();
        setIsBusy(false);
      }
    },
    [isBusy, refreshState, show]
  );

  return {
    counter,
    currentTicket,
    isPaused,
    inCoverGroup,
    covering,
    waiting,
    isBusy,
    notice,
    callNext: () =>
      run(async () => {
        const res = await api.callNext(counterId);
        if (!res.ticket) throw new Error('No customers are waiting in this queue.');
      }),
    complete: () => run(() => api.complete(counterId)),
    recall: () => run(() => api.recall(counterId), 'Announced again.'),
    skip: () => run(() => api.skip(counterId), 'Moved to the on-hold list.'),
    togglePause: () => run(() => api.setCounterStatus(counterId, isPaused ? 'ACTIVE' : 'PAUSED')),
  };
}
