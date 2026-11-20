import React, { useState, useEffect, useRef } from 'react';
import { AdminMetrics, QueueType, Ticket } from '../types';
import { PlaylistEntry, buildPlaylist } from '../playlist';
import { AnnouncementSlide } from '../components/AnnouncementSlide';
import { useQueue } from '../context/QueueContext';
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
  Save,
  Film,
  Upload,
  Trash2,
  GripVertical,
  Play,
  Phone,
  Megaphone,
  Pencil
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
  const [activeTab, setActiveTab] = useState<'metrics' | 'history' | 'backups' | 'media' | 'announcements' | 'settings'>('metrics');
  const { media, announcements, settings: liveSettings } = useQueue();
  const [editing, setEditing] = useState<{ id?: number; title: string; subtitle: string; body: string; active: boolean } | null>(null);
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [announcementSeconds, setAnnouncementSeconds] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  // Local copy of the playlist (videos + announcements) so rows follow the mouse while dragging
  const [playlist, setPlaylist] = useState<PlaylistEntry[]>(() => buildPlaylist(media, announcements));
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  draggingRef.current = draggingKey;
  // Follow the server's list, but only when it changes (not on drop, or the row would snap back)
  useEffect(() => {
    if (draggingRef.current === null) setPlaylist(buildPlaylist(media, announcements));
  }, [media, announcements]);

  // Preview: the selected entry (the first one by default); announcements advance on a timer like the TV
  const previewIdx = Math.max(0, playlist.findIndex((e) => e.key === previewKey));
  const previewEntry: PlaylistEntry | undefined = playlist[previewIdx];
  const isPlayable = (e: PlaylistEntry) => e.type === 'video' || e.announcement.active;
  const previewNext = () => {
    for (let step = 1; step < playlist.length; step++) {
      const candidate = playlist[(previewIdx + step) % playlist.length];
      if (isPlayable(candidate)) {
        setPreviewKey(candidate.key);
        return;
      }
    }
  };
  const previewAnnouncementSeconds = Math.max(5, parseInt(liveSettings.announcement_seconds || '15', 10) || 15);
  useEffect(() => {
    if (activeTab !== 'media' || !previewEntry || previewEntry.type !== 'announcement') return;
    if (playlist.filter(isPlayable).length < 2) return;
    const t = setTimeout(previewNext, previewAnnouncementSeconds * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, previewEntry?.key, playlist.length, previewAnnouncementSeconds]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadName, setUploadName] = useState('');

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

  const handleUploadMedia = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      setUploadName(file.name);
      setUploadProgress(0);
      try {
        await api.uploadMedia(file, setUploadProgress);
      } catch (err: any) {
        alert(`Could not upload ${file.name}: ${err.message}`);
      }
    }
    setUploadProgress(null);
    setUploadName('');
  };

  const handleDeleteMedia = async (id: number, name: string) => {
    if (!window.confirm(`Remove "${name}" from the display?`)) return;
    try {
      await api.deleteMedia(id);
    } catch (err: any) {
      alert('Failed to remove video: ' + err.message);
    }
  };

  // Live reorder: the dragged row jumps to the row it is hovering over
  const handleDragOverEntry = (overKey: string) => {
    if (draggingKey === null || draggingKey === overKey) return;
    setPlaylist((list) => {
      const from = list.findIndex((e) => e.key === draggingKey);
      const to = list.findIndex((e) => e.key === overKey);
      if (from < 0 || to < 0) return list;
      const next = [...list];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  };

  const handleDragEndEntry = async () => {
    setDraggingKey(null);
    const saved = buildPlaylist(media, announcements);
    if (playlist.map((e) => e.key).join() === saved.map((e) => e.key).join()) return;
    try {
      await api.reorderPlaylist(playlist.map((e) => ({ type: e.type, id: e.id })));
    } catch (err: any) {
      setPlaylist(saved);
      alert('Failed to reorder: ' + err.message);
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setIsSavingAnnouncement(true);
    try {
      const { id, ...data } = editing;
      if (id) await api.updateAnnouncement(id, data);
      else await api.createAnnouncement(data);
      setEditing(null);
    } catch (err: any) {
      alert('Failed to save announcement: ' + err.message);
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  const handleToggleAnnouncement = async (a: { id: number; title: string; subtitle: string; body: string; active: boolean }) => {
    try {
      const { id, ...data } = a;
      await api.updateAnnouncement(id, { ...data, active: !a.active });
    } catch (err: any) {
      alert('Failed to update announcement: ' + err.message);
    }
  };

  const handleDeleteAnnouncement = async (id: number, title: string) => {
    if (!window.confirm(`Delete the announcement "${title}"?`)) return;
    try {
      await api.deleteAnnouncement(id);
    } catch (err: any) {
      alert('Failed to delete announcement: ' + err.message);
    }
  };

  const saveAnnouncementSeconds = async () => {
    if (announcementSeconds === null) return;
    const n = Math.max(5, Math.min(120, parseInt(announcementSeconds, 10) || 15));
    try {
      await api.updateSettings({ announcement_seconds: String(n) });
      setSettings((cur) => ({ ...cur, announcement_seconds: String(n) }));
      setAnnouncementSeconds(String(n));
    } catch (err: any) {
      alert('Failed to save: ' + err.message);
    }
  };

  const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024 * 1024
      ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
      : `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;

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
    { id: 'media', label: 'Display playlist', icon: Film },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
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

      {/* TAB: ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="space-y-6">
          {editing ? (
            <form onSubmit={handleSaveAnnouncement} className="card">
              <div className="card-header">
                <div className="card-title">{editing.id ? 'Edit announcement' : 'New announcement'}</div>
              </div>
              <div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="ann_title" className="label">Title <span className="font-normal text-slate-400">(orange banner)</span></label>
                    <input
                      id="ann_title"
                      required
                      maxLength={120}
                      value={editing.title}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      placeholder="NOTICE OF TRANSFER"
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor="ann_subtitle" className="label">Subtitle <span className="font-normal text-slate-400">(optional)</span></label>
                    <input
                      id="ann_subtitle"
                      maxLength={160}
                      value={editing.subtitle}
                      onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                      placeholder="To Our Valued Member-Customer-Owners"
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor="ann_body" className="label">Message <span className="font-normal text-slate-400">(text box)</span></label>
                    <textarea
                      id="ann_body"
                      rows={8}
                      maxLength={2000}
                      value={editing.body}
                      onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                      placeholder={'PANELCO III SATELLITE OFFICE\nis moving soon to a NEW OFFICE'}
                      className="input"
                    />
                    <p className="text-xs text-slate-500 mt-1.5">
                      Type each line on its own row. Everything is shown in the same big green style.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editing.active}
                      onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                    />
                    Show on the TV display
                  </label>
                </div>

                <div>
                  <div className="label mb-1.5">Preview</div>
                  <div className="aspect-[5/3] rounded-lg overflow-hidden ring-1 ring-slate-300 shadow-sm">
                    <AnnouncementSlide
                      title={editing.title || 'NOTICE TITLE'}
                      subtitle={editing.subtitle}
                      body={editing.body}
                    />
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 rounded-b-xl">
                <button type="button" onClick={() => setEditing(null)} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={isSavingAnnouncement} className="btn btn-primary">
                  <Save className="w-4 h-4" />
                  {isSavingAnnouncement ? 'Saving…' : 'Save announcement'}
                </button>
              </div>
            </form>
          ) : (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Announcements</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Posted on the TV display in the video area. Arrange them with the videos in the Display playlist tab. Only switched-on announcements show.
                  </div>
                </div>
                <button
                  onClick={() => setEditing({ title: '', subtitle: '', body: '', active: true })}
                  className="btn btn-primary"
                >
                  <Megaphone className="w-4 h-4" />
                  New announcement
                </button>
              </div>

              <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2 text-sm text-slate-700">
                <label htmlFor="ann_seconds">Show each announcement for</label>
                <input
                  id="ann_seconds"
                  type="number"
                  min={5}
                  max={120}
                  value={announcementSeconds ?? liveSettings.announcement_seconds ?? '15'}
                  onChange={(e) => setAnnouncementSeconds(e.target.value)}
                  onBlur={saveAnnouncementSeconds}
                  className="input w-20 py-1.5"
                />
                seconds
              </div>

              {announcements.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No announcements yet. Click "New announcement" to post one.
                </div>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {announcements.map((a) => (
                    <li key={a.id} className="flex items-center gap-4 px-5 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={a.active}
                        aria-label={`Show "${a.title}" on the display`}
                        onClick={() => handleToggleAnnouncement(a)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                          a.active ? 'bg-emerald-700' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            a.active ? 'translate-x-5' : ''
                          }`}
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium truncate ${a.active ? 'text-slate-900' : 'text-slate-400'}`}>{a.title}</div>
                        {a.subtitle && <div className="text-xs text-slate-500 truncate">{a.subtitle}</div>}
                      </div>
                      <span className={`text-xs ${a.active ? 'text-emerald-700' : 'text-slate-400'}`}>{a.active ? 'On display' : 'Off'}</span>
                      <button onClick={() => setEditing({ ...a })} className="btn btn-secondary btn-sm p-2" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteAnnouncement(a.id, a.title)}
                        className="btn btn-secondary btn-sm p-2 text-red-700"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: DISPLAY PLAYLIST (videos + announcements, one order) */}
      {activeTab === 'media' && (
        <div className="space-y-6">
        {/* Preview: the TV layout with sample counters, playing the selected item */}
        {previewEntry && (() => {
          const sample = [
            { label: 'Counter 1 · Regular', now: 'R-014', next: ['R-015', 'R-016'], bar: 'bg-emerald-700', text: 'text-emerald-800' },
            { label: 'Counter 2 · Priority', now: 'P-006', next: ['P-007'], bar: 'bg-amber-400', text: 'text-amber-600' },
            { label: 'Counter 3 · Request', now: 'C-003', next: ['C-004'], bar: 'bg-sky-700', text: 'text-sky-800' },
          ];
          const name = previewEntry.type === 'video' ? previewEntry.video.original_name : previewEntry.announcement.title;
          const playableCount = playlist.filter(isPlayable).length;
          return (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Preview on the TV display</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Sample ticket numbers. Showing: <span className="font-medium text-slate-700">{name}</span> ({previewIdx + 1} of {playlist.length}
                    {previewEntry.type === 'announcement' && !previewEntry.announcement.active ? ', switched off: not shown on the TV' : ''}). Click the play button on a row to preview it.
                    {playableCount === 0 ? ' Nothing is switched on, so the TV shows only the counters.' : ''}
                  </div>
                </div>
              </div>
              <div className="p-5 bg-slate-100 rounded-b-xl">
                <div className="mx-auto max-w-3xl aspect-video rounded-lg overflow-hidden ring-1 ring-slate-300 shadow-sm bg-slate-50 flex flex-col">
                  <div className="h-1 bg-gradient-to-r from-emerald-800 via-emerald-700 to-amber-400 shrink-0" />
                  <div className="flex-1 min-h-0 flex flex-col gap-2 p-2.5">
                    <div className="flex items-center gap-2 shrink-0">
                      <img src="/logo.png" alt="" className="w-6 h-6 rounded-full bg-white object-contain ring-1 ring-slate-200" />
                      <div className="text-[11px] font-semibold text-slate-900 truncate">
                        {liveSettings.office_name || 'PANELCO III SOUTHEAST AREA OFFICE'}
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 grid grid-cols-[3fr_2fr] gap-2">
                      {previewEntry.type === 'video' ? (
                        <video
                          key={previewEntry.key}
                          src={previewEntry.video.url}
                          className="w-full h-full object-contain bg-black rounded-md"
                          autoPlay
                          muted
                          controls
                          playsInline
                          loop={playableCount <= 1}
                          onEnded={previewNext}
                        />
                      ) : (
                        <div className="rounded-md overflow-hidden ring-1 ring-slate-200 min-h-0">
                          <AnnouncementSlide
                            key={previewEntry.key}
                            title={previewEntry.announcement.title}
                            subtitle={previewEntry.announcement.subtitle}
                            body={previewEntry.announcement.body}
                          />
                        </div>
                      )}
                      <div className="flex flex-col gap-2 min-h-0">
                        {sample.map((c) => (
                          <div key={c.label} className="flex-1 min-h-0 rounded-md bg-white ring-1 ring-slate-200 overflow-hidden flex flex-col">
                            <div className={`h-0.5 shrink-0 ${c.bar}`} />
                            <div className="flex-1 min-h-0 flex items-center">
                              <div className="flex-1 px-2 min-w-0">
                                <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-600 truncate">{c.label}</div>
                                <div className={`text-xl font-bold leading-none tabular-nums ${c.text}`}>{c.now}</div>
                              </div>
                              <div className="w-[38%] self-stretch border-l border-slate-200 bg-slate-50 px-1.5 flex flex-col justify-center">
                                <div className="text-[7px] font-semibold uppercase tracking-wide text-slate-500">Next in line</div>
                                {c.next.map((n) => (
                                  <div key={n} className="text-[11px] font-semibold text-slate-900 leading-tight">{n}</div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-md bg-white ring-1 ring-slate-200 flex items-center overflow-hidden">
                      <div className="flex items-center gap-1 px-2 py-1 bg-emerald-800 text-white text-[8px] uppercase tracking-wide">
                        <Phone className="w-2.5 h-2.5" />
                        {liveSettings.hotline_text ? 'Hotlines' : 'Notice'}
                      </div>
                      <div className="px-2 text-[10px] font-semibold text-slate-900 truncate">
                        {(liveSettings.hotline_text || 'Please wait for your number to be called').split('|').join('  ●  ')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Display playlist</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Videos and announcements play in this order, on a loop, beside the counters on the TV. Drag a row to change the order. Videos: MP4, M4V or WebM, up to 1 GB each.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditing({ title: '', subtitle: '', body: '', active: true });
                  setActiveTab('announcements');
                }}
                className="btn btn-secondary"
              >
                <Megaphone className="w-4 h-4" />
                New announcement
              </button>
              <label className={`btn btn-primary cursor-pointer ${uploadProgress !== null ? 'opacity-60 pointer-events-none' : ''}`}>
                <Upload className="w-4 h-4" />
                Upload video
                <input
                  type="file"
                  accept=".mp4,.m4v,.webm,video/mp4,video/webm"
                  multiple
                  className="hidden"
                  disabled={uploadProgress !== null}
                  onChange={(e) => {
                    handleUploadMedia(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {uploadProgress !== null && (
            <div className="px-5 py-3 border-b border-slate-200">
              <div className="flex justify-between text-sm text-slate-600 mb-1.5">
                <span className="truncate pr-4">Uploading {uploadName}…</span>
                <span className="tabular-nums">{uploadProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-emerald-700 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {playlist.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Nothing here yet. The display shows only the counters until you upload a video or post an announcement.
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {playlist.map((e, i) => {
                const off = e.type === 'announcement' && !e.announcement.active;
                return (
                  <li
                    key={e.key}
                    draggable
                    onDragStart={(ev) => {
                      ev.dataTransfer.effectAllowed = 'move';
                      setDraggingKey(e.key);
                    }}
                    onDragOver={(ev) => {
                      ev.preventDefault();
                      handleDragOverEntry(e.key);
                    }}
                    onDrop={(ev) => ev.preventDefault()}
                    onDragEnd={handleDragEndEntry}
                    className={`flex items-center gap-4 px-5 py-3 transition-colors ${
                      draggingKey === e.key
                        ? 'opacity-50 bg-emerald-50'
                        : e.key === previewEntry?.key
                        ? 'bg-emerald-50/60'
                        : 'bg-white'
                    }`}
                  >
                    <GripVertical className="w-5 h-5 shrink-0 text-slate-400 cursor-grab active:cursor-grabbing" aria-label="Drag to reorder" />
                    <span className="w-7 h-7 shrink-0 rounded-full bg-slate-100 text-sm font-semibold text-slate-600 flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span
                      className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${
                        e.type === 'video' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'
                      } ${off ? 'opacity-50' : ''}`}
                      title={e.type === 'video' ? 'Video' : 'Announcement'}
                    >
                      {e.type === 'video' ? <Film className="w-4 h-4" /> : <Megaphone className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium truncate ${off ? 'text-slate-400' : 'text-slate-900'}`}>
                        {e.type === 'video' ? e.video.original_name : e.announcement.title}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {e.type === 'video'
                          ? `Video · ${formatSize(e.video.size_bytes)}`
                          : `Announcement · ${off ? 'switched off' : `shown for ${previewAnnouncementSeconds} seconds`}`}
                      </div>
                    </div>
                    <button onClick={() => setPreviewKey(e.key)} className="btn btn-secondary btn-sm p-2" title="Preview on the display">
                      <Play className="w-4 h-4" />
                    </button>
                    {e.type === 'announcement' && (
                      <button
                        onClick={() => {
                          setEditing({ ...e.announcement });
                          setActiveTab('announcements');
                        }}
                        className="btn btn-secondary btn-sm p-2"
                        title="Edit announcement"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() =>
                        e.type === 'video'
                          ? handleDeleteMedia(e.id, e.video.original_name)
                          : handleDeleteAnnouncement(e.id, e.announcement.title)
                      }
                      className="btn btn-secondary btn-sm p-2 text-red-700"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
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
              <label htmlFor="hotline_text" className="label">
                Hotline numbers <span className="font-normal text-slate-400">(scrolls at the bottom of the TV display; separate entries with |)</span>
              </label>
              <input
                id="hotline_text"
                type="text"
                value={settings.hotline_text || ''}
                onChange={(e) => setSettings({ ...settings, hotline_text: e.target.value })}
                placeholder="Billing: (000) 000-0000 | Emergency: 000-0000"
                className="input"
              />
            </div>

            <div>
              <div className="text-sm font-medium text-slate-900">Load balancing</div>
              <p className="text-xs text-slate-500 mt-0.5 mb-3">
                Controls the order when one counter serves both the Priority and the Regular line: when the other counter is paused, or all the time if you turn on the second option.
              </p>
              <div className="flex items-start gap-4 rounded-xl border border-slate-200 p-4">
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.priority_balance_enabled === 'true'}
                  aria-label="Balance Priority and Regular lines"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      priority_balance_enabled: settings.priority_balance_enabled === 'true' ? 'false' : 'true',
                    })
                  }
                  className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                    settings.priority_balance_enabled === 'true' ? 'bg-emerald-700' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      settings.priority_balance_enabled === 'true' ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">Alternate Priority and Regular customers</div>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {settings.priority_balance_enabled === 'true'
                      ? `The covering counter calls 1 Priority, then ${settings.priority_balance_ratio || '3'} Regular, then Priority again. Each line stays first come, first served, and if one line is empty the other is called in order.`
                      : 'Off: the covering counter calls every waiting Priority customer before any Regular customer.'}
                  </p>
                  {settings.priority_balance_enabled === 'true' && (
                    <div className="mt-4 flex items-start gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.priority_balance_always === 'true'}
                        aria-label="Also balance when both counters are open"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            priority_balance_always: settings.priority_balance_always === 'true' ? 'false' : 'true',
                          })
                        }
                        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                          settings.priority_balance_always === 'true' ? 'bg-emerald-700' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            settings.priority_balance_always === 'true' ? 'translate-x-5' : ''
                          }`}
                        />
                      </button>
                      <div>
                        <div className="text-sm font-medium text-slate-900">Also balance when both counters are open</div>
                        <p className="text-sm text-slate-500 mt-0.5">
                          {settings.priority_balance_always === 'true'
                            ? 'Counter 1 and Counter 2 share both lines all the time. Whichever counter calls next takes the next customer in the same Priority / Regular pattern, so the load is spread evenly.'
                            : 'Off: while both counters are open, Counter 1 only calls Regular and Counter 2 only calls Priority. Sharing starts only when one counter is paused.'}
                        </p>
                      </div>
                    </div>
                  )}
                  {settings.priority_balance_enabled === 'true' && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                      <label htmlFor="priority_balance_ratio">Regular customers per Priority:</label>
                      <input
                        id="priority_balance_ratio"
                        type="number"
                        min={1}
                        max={10}
                        value={settings.priority_balance_ratio || '3'}
                        onChange={(e) => setSettings({ ...settings, priority_balance_ratio: e.target.value })}
                        className="input w-20 py-1.5"
                      />
                    </div>
                  )}
                </div>
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
