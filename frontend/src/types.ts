export type QueueType = 'REGULAR' | 'PRIORITY' | 'COMPLAINT';

export type TicketStatus = 'WAITING' | 'CALLED' | 'SERVING' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';

export interface Ticket {
  id: number;
  queue_number: string;
  queue_type: QueueType;
  session_date: string;
  number_seq: number;
  status: TicketStatus;
  created_at: string;
  called_at?: string | null;
  serving_at?: string | null;
  completed_at?: string | null;
  counter_id?: number | null;
  counter_name?: string | null;
  called_by_user?: string | null;
  notes?: string | null;
  office_name?: string;
  date_formatted?: string;
  time_formatted?: string;
}

export interface Counter {
  id: number;
  name: string;
  queue_type: QueueType;
  status: 'ACTIVE' | 'PAUSED' | 'OFFLINE';
  current_ticket_id?: number | null;
  current_ticket?: Ticket | null;
}

export interface SkippedTicket {
  id: number;
  queue_number: string;
  queue_type: QueueType;
  called_at: string;
  counter_id: number;
  counter_name: string;
}

export interface RecentlyServedTicket {
  id: number;
  queue_number: string;
  queue_type: QueueType;
  completed_at: string;
  counter_name: string;
}

export interface WaitingTicket {
  id: number;
  queue_number: string;
  queue_type: QueueType;
  number_seq: number;
  created_at: string;
  notes?: string | null;
}

export interface WaitingCounts {
  REGULAR: number;
  PRIORITY: number;
  COMPLAINT: number;
  TOTAL: number;
}

export interface QueueStateSnapshot {
  event: string;
  action: string;
  timestamp: string;
  counters: Counter[];
  waiting_counts: WaitingCounts;
  waiting_tickets?: WaitingTicket[];
  skipped_tickets: SkippedTicket[];
  recently_served: RecentlyServedTicket[];
  last_called_ticket?: {
    id: number;
    queue_number: string;
    queue_type: QueueType;
    counter_id: number;
    counter_name: string;
    called_at: string;
  } | null;
  settings: Record<string, string>;
}

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: 'ADMIN' | 'GUARD' | 'COUNTER';
}

export interface AdminMetrics {
  session_date: string;
  status_counts: Record<string, number>;
  queue_counts: Record<string, number>;
  counter_performance: Array<{
    counter_id: number;
    counter_name: string;
    served_count: number;
  }>;
  avg_wait_minutes: number;
  avg_service_minutes: number;
}
