import React, { useState, useEffect } from 'react';
import { AdminMetrics, QueueType, Ticket } from '../types';
import { QUEUE_META, queueLabel, formatTime } from '../queueStyles';
import { api } from '../services/api';
import { 
  BarChart3, 
  Download, 
  Database, 
  Settings, 
  Clock, 
  Users, 
  CheckCircle, 
  FileSpreadsheet, 
  HardDrive,
  RefreshCw,
  Save
} from 'lucide-react';

export const AdminPage: React.FC = () => {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [backups, setBackups] = useState<Array<{ filename: string; size_kb: number; modified_at: string }>>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [activeTab, setActiveTab] = useState<'metrics' | 'history' | 'backups' | 'settings'>('metrics');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [m, s, tList, bList] = await Promise.all([
        api.getMetrics(),
        api.getSettings(),
        api.getTicketHistory(selectedDate),
        api.listBackups(),
      ]);
      setMetrics(m);
      setSettings(s);
      setTickets(tList);
      setBackups(bList);
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await api.updateSettings(settings);
      alert('Settings updated successfully!');
    } catch (err: any) {
      alert('Failed to update settings: ' + err.message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await api.backupDatabase();
      alert(`Backup created successfully: ${res.filename} (${res.size_kb} KB)`);
      const updatedBackups = await api.listBackups();
      setBackups(updatedBackups);
    } catch (err: any) {
      alert('Backup failed: ' + err.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleExportCsv = () => {
    window.open(api.getExportCsvUrl(selectedDate), '_blank');
  };

  const statusChip = (status: string) =>
    status === 'COMPLETED'
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
      : status === 'WAITING'
      ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
      : status === 'CALLED' || status === 'SERVING'
      ? 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200'
      : status === 'CANCELLED'
      ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
      : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200';

  const totalByQueue = metrics ? Math.max(1, ...Object.values(metrics.queue_counts)) : 1;
  const maxServed = metrics ? Math.max(1, ...metrics.counter_performance.map((c) => c.served_count)) : 1;

  const tabs = [
    { id: 'metrics', label: 'Overview', icon: BarChart3 },
    { id: 'history', label: 'Ticket log', icon: FileSpreadsheet },
    { id: 'backups', label: 'Backups', icon: Database },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="page-title">Administration</h1>
          <p className="page-subtitle">Today's performance, ticket records, backups and system settings.</p>
        </div>
        <button onClick={loadData} disabled={isLoading} className="btn btn-secondary btn-sm py-2 self-start sm:self-auto">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 -mt-2">
        <nav className="flex gap-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'border-emerald-700 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'metrics' && metrics && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Tickets issued', value: metrics.status_counts.TOTAL || 0, unit: '', icon: Users },
              { label: 'Completed', value: metrics.status_counts.COMPLETED || 0, unit: '', icon: CheckCircle },
              { label: 'Average wait', value: metrics.avg_wait_minutes, unit: 'min', icon: Clock },
              { label: 'Average service', value: metrics.avg_service_minutes, unit: 'min', icon: Clock },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="card p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">{stat.label}</span>
                    <Icon className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tabular-nums text-slate-900">{stat.value}</span>
                    {stat.unit && <span className="text-sm text-slate-500">{stat.unit}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card">
              <div className="card-header">
                <div className="card-title">Tickets by queue</div>
                <span className="text-xs text-slate-500">Today</span>
              </div>
              <div className="p-5 space-y-4">
                {Object.keys(metrics.queue_counts).length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No tickets issued yet today.</p>
                ) : (
                  (['REGULAR', 'PRIORITY', 'COMPLAINT'] as QueueType[]).map((q) => {
                    const count = metrics.queue_counts[q] || 0;
                    return (
                      <div key={q}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="flex items-center gap-2 text-slate-700">
                            <span className={`w-2 h-2 rounded-full ${QUEUE_META[q].dot}`} />
                            {QUEUE_META[q].label}
                          </span>
                          <span className="font-semibold tabular-nums text-slate-900">{count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${QUEUE_META[q].dot}`}
                            style={{ width: `${(count / totalByQueue) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">Customers served by counter</div>
                <span className="text-xs text-slate-500">Today</span>
              </div>
              <div className="p-5 space-y-4">
                {metrics.counter_performance.map((c) => (
                  <div key={c.counter_id}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-slate-700">{c.counter_name}</span>
                      <span className="font-semibold tabular-nums text-slate-900">{c.served_count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-700"
                        style={{ width: `${(c.served_count / maxServed) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TICKET LOG & CSV EXPORT */}
      {activeTab === 'history' && (
        <div className="card overflow-hidden">
          <div className="card-header flex-col sm:flex-row items-stretch sm:items-center">
            <div className="flex items-center gap-3">
              <label htmlFor="log-date" className="text-sm text-slate-600">
                Date
              </label>
              <input
                id="log-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="input w-auto py-1.5"
              />
              <span className="text-sm text-slate-500">{tickets.length} tickets</span>
            </div>

            <button onClick={handleExportCsv} className="btn btn-secondary btn-sm py-2">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-5 font-medium">Ticket</th>
                  <th className="py-2.5 px-3 font-medium">Queue</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">Issued</th>
                  <th className="py-2.5 px-3 font-medium">Called</th>
                  <th className="py-2.5 px-3 font-medium">Completed</th>
                  <th className="py-2.5 px-3 font-medium">Counter</th>
                  <th className="py-2.5 px-5 font-medium">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm text-slate-500">
                      No tickets recorded for this date.
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-5 ticket-no text-slate-900">{t.queue_number}</td>
                      <td className="py-2.5 px-3 text-slate-600">{queueLabel(t.queue_type)}</td>
                      <td className="py-2.5 px-3">
                        <span className={`badge capitalize ${statusChip(t.status)}`}>{t.status.toLowerCase()}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 tabular-nums">{formatTime(t.created_at) || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-500 tabular-nums">{formatTime(t.called_at) || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-500 tabular-nums">{formatTime(t.completed_at) || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-700">{t.counter_name || '—'}</td>
                      <td className="py-2.5 px-5 text-slate-500">{t.called_by_user || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: BACKUPS */}
      {activeTab === 'backups' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Database backups</div>
              <div className="text-xs text-slate-500 mt-0.5">Saved on the server in the backend/backups folder.</div>
            </div>
            <button onClick={handleCreateBackup} disabled={isBackingUp} className="btn btn-primary btn-sm py-2">
              <HardDrive className="w-4 h-4" />
              {isBackingUp ? 'Creating…' : 'Create backup'}
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {backups.length === 0 ? (
              <p className="text-sm text-slate-500 py-12 text-center">No backups yet.</p>
            ) : (
              backups.map((b) => (
                <div key={b.filename} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                      <Database className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{b.filename}</div>
                      <div className="text-xs text-slate-500">{b.modified_at}</div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500 tabular-nums shrink-0">{b.size_kb} KB</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SETTINGS */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Office and system settings</div>
              <div className="text-xs text-slate-500 mt-0.5">Changes apply right away on every screen and receipt.</div>
            </div>
          </div>

          <div className="p-5 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="office_name" className="label">
                  Office name
                </label>
                <input
                  id="office_name"
                  type="text"
                  value={settings.office_name || ''}
                  onChange={(e) => setSettings({ ...settings, office_name: e.target.value })}
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="office_tagline" className="label">
                  Tagline <span className="font-normal text-slate-400">(shown on the TV display)</span>
                </label>
                <input
                  id="office_tagline"
                  type="text"
                  value={settings.office_tagline || ''}
                  onChange={(e) => setSettings({ ...settings, office_tagline: e.target.value })}
                  className="input"
                />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-slate-900">Ticket prefixes</div>
              <p className="text-xs text-slate-500 mt-0.5 mb-3">The letter printed before each ticket number.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {([
                  ['regular_prefix', 'REGULAR', 'R'],
                  ['priority_prefix', 'PRIORITY', 'P'],
                  ['complaint_prefix', 'COMPLAINT', 'C'],
                ] as const).map(([key, q, fallback]) => (
                  <div key={key}>
                    <label htmlFor={key} className="label">
                      {QUEUE_META[q].label}
                    </label>
                    <input
                      id={key}
                      type="text"
                      maxLength={3}
                      value={settings[key] || fallback}
                      onChange={(e) => setSettings({ ...settings, [key]: e.target.value.toUpperCase() })}
                      className="input font-semibold"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex justify-end rounded-b-xl">
            <button type="submit" disabled={isSavingSettings} className="btn btn-primary">
              <Save className="w-4 h-4" />
              {isSavingSettings ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
