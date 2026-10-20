import { QueueType } from './types';

/**
 * One colour per queue, used the same way on every screen:
 * Regular = green, Priority = amber, Request / Complaint = blue.
 */
export const QUEUE_META: Record<
  QueueType,
  {
    label: string;
    description: string;
    counter: string;
    /** Solid tile, e.g. the prefix letter on the guard buttons */
    solid: string;
    /** Soft chip for lists and tables */
    chip: string;
    /** Small status dot */
    dot: string;
    /** Accent bar on the TV display */
    bar: string;
    /** Ticket number colour on the TV display */
    tvText: string;
  }
> = {
  REGULAR: {
    label: 'Regular',
    description: 'General inquiries and transactions',
    counter: 'Counter 1',
    solid: 'bg-emerald-700 text-white',
    chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
    dot: 'bg-emerald-600',
    bar: 'bg-emerald-500',
    tvText: 'text-white',
  },
  PRIORITY: {
    label: 'Priority',
    description: 'Senior citizens, PWD, pregnant women',
    counter: 'Counter 2',
    solid: 'bg-amber-500 text-amber-950',
    chip: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
    dot: 'bg-amber-500',
    bar: 'bg-amber-400',
    tvText: 'text-amber-300',
  },
  COMPLAINT: {
    label: 'Request / Complaint',
    description: 'Formal requests and complaints',
    counter: 'Counter 3',
    solid: 'bg-sky-700 text-white',
    chip: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200',
    dot: 'bg-sky-600',
    bar: 'bg-sky-400',
    tvText: 'text-white',
  },
};

export const queueLabel = (q: string) => QUEUE_META[q as QueueType]?.label ?? q;

/** "2026-10-20 08:55:40" -> "8:55 AM" */
export const formatTime = (value?: string | null) => {
  if (!value) return '';
  const time = value.split(' ')[1] || value;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
};
