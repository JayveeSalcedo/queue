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
  const { counters, waitingCounts, waitingTickets, coverOrder, settings, refreshState } = useQueue();
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

  // Customers this counter could send to another line: the one at the counter, then the waiting ones
  // in the order they will be called
  const rank = new Map(coverOrder.map((tid, i) => [tid, i]));
  const waitingHere = waitingTickets
    .filter((t) => servable.includes(t.queue_type))
    .sort((a, b) =>
      servable.length > 1 && rank.has(a.id) && rank.has(b.id) ? rank.get(a.id)! - rank.get(b.id)! : a.number_seq - b.number_seq
    );
  const transferable: Array<{ id: number; queue_number: string; queue_type: QueueType; serving: boolean }> = [
    ...(currentTicket
      ? [{ id: currentTicket.id, queue_number: currentTicket.queue_number, queue_type: currentTicket.queue_type, serving: true }]
      : []),
    ...waitingHere.map((t) => ({ id: t.id, queue_number: t.queue_number, queue_type: t.queue_type, serving: false })),
  ];

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
        const result = await action();
        // An action may return its own message (for example how many customers were moved)
        show(typeof result === 'string' ? { kind: 'info', text: result } : success ? { kind: 'info', text: success } : null);
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
    waitingCounts,
    transferable,
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
    transferMany: (ticketIds: number[], target: QueueType) =>
      run(async () => (await api.transferMany(counterId, ticketIds, target)).message),
    // Help another line: take its next waiting customer (only while this counter is free)
    takeFrom: (queueType: QueueType) => run(async () => (await api.takeFrom(counterId, queueType)).message),
    noShowCurrent: () =>
      run(async () => {
        if (!currentTicket) throw new Error('There is no customer at the counter.');
        await api.markNoShow(counterId, currentTicket.id);
        return `${currentTicket.queue_number} marked as a no-show.`;
      }),
    togglePause: () => run(() => api.setCounterStatus(counterId, isPaused ? 'ACTIVE' : 'PAUSED')),
  };
}
