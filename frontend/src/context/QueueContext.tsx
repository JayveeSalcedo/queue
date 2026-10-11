import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Counter, WaitingCounts, WaitingTicket, SkippedTicket, RecentlyServedTicket, QueueStateSnapshot } from '../types';
import { api } from '../services/api';
import { audioService } from '../services/audio';

interface QueueContextType {
  counters: Counter[];
  waitingCounts: WaitingCounts;
  waitingTickets: WaitingTicket[];
  skippedTickets: SkippedTicket[];
  recentlyServed: RecentlyServedTicket[];
  settings: Record<string, string>;
  isConnected: boolean;
  lastCalledTicket: any | null;
  refreshState: () => Promise<void>;
  enableAudio: () => void;
  isAudioEnabled: boolean;
}

const QueueContext = createContext<QueueContextType | undefined>(undefined);

export const QueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [counters, setCounters] = useState<Counter[]>([]);
  const [waitingCounts, setWaitingCounts] = useState<WaitingCounts>({ REGULAR: 0, PRIORITY: 0, COMPLAINT: 0, TOTAL: 0 });
  const [waitingTickets, setWaitingTickets] = useState<WaitingTicket[]>([]);
  const [skippedTickets, setSkippedTickets] = useState<SkippedTicket[]>([]);
  const [recentlyServed, setRecentlyServed] = useState<RecentlyServedTicket[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [lastCalledTicket, setLastCalledTicket] = useState<any | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(audioService.isEnabled());

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  const applySnapshot = useCallback((data: QueueStateSnapshot) => {
    if (data.counters) setCounters(data.counters);
    if (data.waiting_counts) setWaitingCounts(data.waiting_counts);
    if (data.waiting_tickets) setWaitingTickets(data.waiting_tickets);
    if (data.skipped_tickets) setSkippedTickets(data.skipped_tickets);
    if (data.recently_served) setRecentlyServed(data.recently_served);
    if (data.settings) setSettings(data.settings);

    if (data.last_called_ticket && (data.action === 'CALLED' || data.action === 'RECALLED')) {
      setLastCalledTicket(data.last_called_ticket);
      audioService.announceCall(
        data.last_called_ticket.queue_number,
        data.last_called_ticket.counter_name
      );
    }
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const snap = await api.getQueueStatus();
      applySnapshot(snap);
    } catch (err) {
      console.error('Failed to fetch queue snapshot:', err);
    }
  }, [applySnapshot]);

  const connectWs = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: QueueStateSnapshot = JSON.parse(event.data);
          applySnapshot(data);
        } catch {
          // Non-json ping/pong messages
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // Auto reconnect every 2.5s
        reconnectTimeoutRef.current = setTimeout(connectWs, 2500);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimeoutRef.current = setTimeout(connectWs, 2500);
    }
  }, [applySnapshot]);

  useEffect(() => {
    refreshState();
    connectWs();

    // Ping interval to keep socket alive through NAT/firewalls
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 15000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWs, refreshState]);

  const enableAudio = () => {
    const next = !isAudioEnabled;
    audioService.setEnabled(next);
    setIsAudioEnabled(next);
    if (next) {
      audioService.playChime();
    }
  };

  return (
    <QueueContext.Provider
      value={{
        counters,
        waitingCounts,
        waitingTickets,
        skippedTickets,
        recentlyServed,
        settings,
        isConnected,
        lastCalledTicket,
        refreshState,
        enableAudio,
        isAudioEnabled,
      }}
    >
      {children}
    </QueueContext.Provider>
  );
};

export const useQueue = () => {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error('useQueue must be used within a QueueProvider');
  }
  return context;
};
