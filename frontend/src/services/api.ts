import { QueueType, Ticket, Counter, QueueStateSnapshot, User, AdminMetrics } from '../types';

const API_BASE = '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('queue_auth_token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('queue_auth_token', token);
}

export function removeAuthToken() {
  localStorage.removeItem('queue_auth_token');
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // A session that expired mid-shift must not strand the station with no way
  // back in: drop the dead token and send the user to the login screen.
  if (response.status === 401 && endpoint !== '/auth/login') {
    removeAuthToken();
    if (window.location.pathname !== '/login') {
      window.location.assign(
        `/login?next=${encodeURIComponent(window.location.pathname)}`
      );
    }
    throw new Error('Your session expired. Please sign in again.');
  }

  if (!response.ok) {
    let errorDetail = 'An error occurred';
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errorDetail;
    } catch {
      errorDetail = response.statusText;
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export const api = {
  // Auth
  async login(username: string, password: string): Promise<{ access_token: string; user: User }> {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async getMe(): Promise<User> {
    return request('/auth/me');
  },

  // Tickets
  async generateTicket(queue_type: QueueType, notes?: string): Promise<Ticket> {
    return request('/tickets/generate', {
      method: 'POST',
      body: JSON.stringify({ queue_type, notes }),
    });
  },

  async voidTicket(ticketId: number): Promise<{ message: string; queue_number: string; sequence_rolled_back: boolean }> {
    return request(`/tickets/${ticketId}/void`, {
      method: 'POST',
    });
  },

  async resetDaily(): Promise<{ message: string; session_date: string }> {
    return request('/tickets/reset-daily', {
      method: 'POST',
      body: JSON.stringify({ confirmed: true }),
    });
  },

  async getQueueStatus(): Promise<QueueStateSnapshot> {
    return request('/tickets/status');
  },

  async getTicketHistory(date?: string): Promise<Ticket[]> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/tickets/history${query}`);
  },

  getExportCsvUrl(date?: string): string {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return `${API_BASE}/tickets/export-csv${query}`;
  },

  // Counters
  async listCounters(): Promise<Counter[]> {
    return request('/counters');
  },

  async callNext(counterId: number): Promise<{ message: string; ticket: any }> {
    return request(`/counters/${counterId}/call-next`, {
      method: 'POST',
    });
  },

  async callTicket(counterId: number, ticketId: number): Promise<{ message: string; ticket: any }> {
    return request(`/counters/${counterId}/call-ticket`, {
      method: 'POST',
      body: JSON.stringify({ ticket_id: ticketId }),
    });
  },

  async setCounterStatus(
    counterId: number,
    status: 'ACTIVE' | 'PAUSED'
  ): Promise<{ message: string; counter_id: number; status: string }> {
    return request(`/counters/${counterId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  async recall(counterId: number): Promise<{ message: string; ticket: any }> {
    return request(`/counters/${counterId}/recall`, {
      method: 'POST',
    });
  },

  async skip(counterId: number): Promise<{ message: string }> {
    return request(`/counters/${counterId}/skip`, {
      method: 'POST',
    });
  },

  async complete(counterId: number): Promise<{ message: string }> {
    return request(`/counters/${counterId}/complete`, {
      method: 'POST',
    });
  },

  async recallSkipped(counterId: number, ticketId: number): Promise<{ message: string; ticket: any }> {
    return request(`/counters/${counterId}/recall-skipped`, {
      method: 'POST',
      body: JSON.stringify({ ticket_id: ticketId }),
    });
  },

  async markNoShow(counterId: number, ticketId: number): Promise<{ message: string }> {
    return request(`/counters/${counterId}/mark-no-show`, {
      method: 'POST',
      body: JSON.stringify({ ticket_id: ticketId }),
    });
  },

  async transfer(counterId: number, ticketId: number, targetQueueType: QueueType, notes?: string): Promise<{ message: string }> {
    return request(`/counters/${counterId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        target_queue_type: targetQueueType,
        notes,
      }),
    });
  },

  // Admin
  async getMetrics(): Promise<AdminMetrics> {
    return request('/admin/metrics');
  },

  async getSettings(): Promise<Record<string, string>> {
    return request('/admin/settings');
  },

  async updateSettings(settings: Record<string, string>): Promise<{ message: string }> {
    return request('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async backupDatabase(): Promise<{ message: string; filename: string; size_kb: number }> {
    return request('/admin/backup-db', {
      method: 'POST',
    });
  },

  async listBackups(): Promise<Array<{ filename: string; size_kb: number; modified_at: string }>> {
    return request('/admin/backups');
  },

  // Network info
  async getNetworkInfo(): Promise<{ hostname: string; primary_ip: string; ip_addresses: string[]; port: number }> {
    return request('/network-info');
  },
};
