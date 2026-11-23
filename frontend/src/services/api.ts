import { Announcement, MediaItem, QueueType, Ticket, Counter, QueueStateSnapshot, User, AdminMetrics } from '../types';

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

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch {
    // fetch only throws when the server cannot be reached at all
    throw new Error('Cannot reach the queue server. Check the network connection and try again.');
  }

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
    let errorDetail = 'Something went wrong. Please try again.';
    try {
      const errJson = await response.json();
      // The server's own messages are written for people; a list means the form data was invalid
      if (typeof errJson.detail === 'string' && response.status < 500) errorDetail = errJson.detail;
      else if (Array.isArray(errJson.detail)) errorDetail = 'Please check the information you entered.';
    } catch {
      /* keep the generic message */
    }
    if (response.status >= 500) errorDetail = 'The server had a problem. Please try again in a moment.';
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

  // Send several customers (the one being served and/or waiting ones) to another line at once
  async transferMany(counterId: number, ticketIds: number[], targetQueueType: QueueType): Promise<{ moved: number; skipped: number; message: string }> {
    return request(`/counters/${counterId}/transfer-many`, {
      method: 'POST',
      body: JSON.stringify({ ticket_ids: ticketIds, target_queue_type: targetQueueType }),
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

  // Infomercial videos for the TV display
  async listMedia(): Promise<MediaItem[]> {
    return request('/media');
  },

  // Uses XMLHttpRequest rather than fetch so large videos can report upload progress
  uploadMedia(file: File, onProgress?: (percent: number) => void): Promise<MediaItem> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/admin/media`);
      const token = getAuthToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let body: any = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* non-JSON error body */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.detail || `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Upload failed. Check the connection to the server.'));
      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  },

  async deleteMedia(id: number): Promise<{ message: string }> {
    return request(`/admin/media/${id}`, { method: 'DELETE' });
  },

  // One order for everything on the display: videos and announcements together
  async reorderPlaylist(items: Array<{ type: 'video' | 'announcement'; id: number }>): Promise<{ message: string }> {
    return request('/admin/playlist/order', { method: 'PUT', body: JSON.stringify({ items }) });
  },

  // Announcements shown on the TV display
  async createAnnouncement(data: Omit<Announcement, 'id' | 'sort_order'>): Promise<Announcement> {
    return request('/admin/announcements', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateAnnouncement(id: number, data: Omit<Announcement, 'id' | 'sort_order'>): Promise<Announcement> {
    return request(`/admin/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteAnnouncement(id: number): Promise<{ message: string }> {
    return request(`/admin/announcements/${id}`, { method: 'DELETE' });
  },

  // Network info
  async getNetworkInfo(): Promise<{
    hostname: string; primary_ip: string; ip_addresses: string[]; port: number;
    fixed_ip: string | null; ip_changed: boolean;
  }> {
    return request('/network-info');
  },
};
