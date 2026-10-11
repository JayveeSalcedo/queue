import React, { useState, useEffect } from 'react';
import { AdminMetrics, Ticket } from '../types';
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-sm border border-emerald-100">
        <div>
          <h1 className="text-2xl font-black text-emerald-950 flex items-center space-x-2">
            <span>Admin Management</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            System metrics, logs, database backups, and configurations
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-full sm:w-auto overflow-x-auto">
          {[
            { id: 'metrics', label: 'Metrics', icon: BarChart3 },
            { id: 'history', label: 'Ticket Logs', icon: FileSpreadsheet },
            { id: 'backups', label: 'DB Backups', icon: Database },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === tab.id
                    ? 'bg-emerald-800 text-amber-300 shadow-sm'
                    : 'text-slate-600 hover:text-emerald-950 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: METRICS */}
      {activeTab === 'metrics' && metrics && (
        <div className="space-y-6">
          {/* Key Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Generated</span>
              <span className="text-3xl font-black text-emerald-950 mt-1 block font-mono">
                {metrics.status_counts.TOTAL || 0}
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Completed</span>
              <span className="text-3xl font-black text-emerald-700 mt-1 block font-mono">
                {metrics.status_counts.COMPLETED || 0}
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Avg Wait Time</span>
              <span className="text-3xl font-black text-amber-600 mt-1 block font-mono">
                {metrics.avg_wait_minutes} <span className="text-sm font-normal text-slate-500">mins</span>
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Avg Service Time</span>
              <span className="text-3xl font-black text-teal-700 mt-1 block font-mono">
                {metrics.avg_service_minutes} <span className="text-sm font-normal text-slate-500">mins</span>
              </span>
            </div>
          </div>

          {/* Performance breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Queue Type */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">
                Today's Breakdown By Queue Type
              </h3>
              <div className="space-y-3">
                {Object.entries(metrics.queue_counts).map(([q, count]) => (
                  <div key={q} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-bold text-sm text-slate-700">{q}</span>
                    <span className="font-mono font-black text-base text-emerald-950">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By Counter */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">
                Tickets Served Per Counter
              </h3>
              <div className="space-y-3">
                {metrics.counter_performance.map((c) => (
                  <div key={c.counter_id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-bold text-sm text-slate-700">{c.counter_name}</span>
                    <span className="font-mono font-black text-base text-emerald-800">{c.served_count} served</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TICKET LOGS & CSV EXPORT */}
      {activeTab === 'history' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Date:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-semibold"
              />
            </div>

            <button
              onClick={handleExportCsv}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all"
            >
              <Download className="w-4 h-4 text-amber-300" />
              <span>Export CSV Report</span>
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">Ticket #</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-3">Called</th>
                  <th className="py-3 px-3">Completed</th>
                  <th className="py-3 px-3">Counter</th>
                  <th className="py-3 px-3">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400 italic">
                      No tickets recorded for this date.
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-950">{t.queue_number}</td>
                      <td className="py-2.5 px-3">{t.queue_type}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                          t.status === 'WAITING' ? 'bg-amber-100 text-amber-800' :
                          t.status === 'SKIPPED' ? 'bg-slate-100 text-slate-700' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{t.created_at?.split(' ')[1] || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-500">{t.called_at?.split(' ')[1] || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-500">{t.completed_at?.split(' ')[1] || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-700 font-semibold">{t.counter_name || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-500">{t.called_by_user || '-'}</td>
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
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-black text-emerald-950">Local SQLite Database Backups</h3>
              <p className="text-xs text-slate-500">Backups are stored locally in the server's /backups directory</p>
            </div>
            <button
              onClick={handleCreateBackup}
              disabled={isBackingUp}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-emerald-950 font-black text-xs flex items-center space-x-2 shadow-md transition-all"
            >
              <HardDrive className="w-4 h-4 text-emerald-950" />
              <span>{isBackingUp ? 'Creating Backup...' : 'Create Backup Now'}</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {backups.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">No backup snapshots created yet.</p>
            ) : (
              backups.map((b) => (
                <div key={b.filename} className="py-3 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Database className="w-5 h-5 text-emerald-700" />
                    <div>
                      <div className="font-mono font-bold text-xs text-slate-800">{b.filename}</div>
                      <div className="text-[11px] text-slate-400">{b.modified_at}</div>
                    </div>
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-600">
                    {b.size_kb} KB
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SETTINGS */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <div className="pb-4 border-b border-slate-200">
            <h3 className="text-base font-black text-emerald-950">Office & System Settings</h3>
            <p className="text-xs text-slate-500">Changes apply immediately across all client devices and receipts</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Office / Department Name
              </label>
              <input
                type="text"
                value={settings.office_name || ''}
                onChange={(e) => setSettings({ ...settings, office_name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Office Tagline (Public Display)
              </label>
              <input
                type="text"
                value={settings.office_tagline || ''}
                onChange={(e) => setSettings({ ...settings, office_tagline: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Regular Queue Prefix
              </label>
              <input
                type="text"
                maxLength={3}
                value={settings.regular_prefix || 'R'}
                onChange={(e) => setSettings({ ...settings, regular_prefix: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Priority Queue Prefix
              </label>
              <input
                type="text"
                maxLength={3}
                value={settings.priority_prefix || 'P'}
                onChange={(e) => setSettings({ ...settings, priority_prefix: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Request / Complaint Prefix
              </label>
              <input
                type="text"
                maxLength={3}
                value={settings.complaint_prefix || 'C'}
                onChange={(e) => setSettings({ ...settings, complaint_prefix: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-6 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-amber-300 font-black text-sm flex items-center space-x-2 shadow-md transition-all"
            >
              <Save className="w-4 h-4 text-amber-400" />
              <span>{isSavingSettings ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
