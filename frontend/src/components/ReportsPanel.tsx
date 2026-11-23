import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { AdminReport, QueueType } from '../types';
import { QUEUE_META } from '../queueStyles';

// Hours shown in the charts: 6 AM through the 5 PM hour (5:00-5:59 PM)
const OPEN_HOUR = 6;
const CLOSE_HOUR = 18; // exclusive

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Local calendar date as YYYY-MM-DD (toISOString would shift it to UTC)
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};

const hourLabel = (h: number) => {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
};

const mins = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v} min`);

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const PRESETS: Array<{ id: string; label: string; range: () => [string, string] }> = [
  { id: 'today', label: 'Today', range: () => [ymd(new Date()), ymd(new Date())] },
  { id: '7', label: 'Last 7 days', range: () => [daysAgo(6), ymd(new Date())] },
  { id: '30', label: 'Last 30 days', range: () => [daysAgo(29), ymd(new Date())] },
  {
    id: 'month',
    label: 'This month',
    range: () => {
      const now = new Date();
      return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(now)];
    },
  },
];

const csvCell = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const ReportsPanel: React.FC = () => {
  const [start, setStart] = useState(daysAgo(6));
  const [end, setEnd] = useState(ymd(new Date()));
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!start || !end) return;
    setLoading(true);
    setError('');
    try {
      setReport(await api.getReport(start, end));
    } catch (e: any) {
      setReport(null);
      setError(e?.message || 'Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    load();
  }, [load]);

  // Average tickets per open day for each hour of the day (all weekdays together)
  const hourly = useMemo(() => {
    if (!report) return [];
    const days = Math.max(1, report.summary.days_open);
    return Array.from({ length: 24 }, (_, h) => {
      const total = report.heatmap.reduce((sum, row) => sum + row[h], 0);
      return { hour: h, total, perDay: total / days };
    });
  }, [report]);

  const visibleHours = hourly.filter((h) => h.hour >= OPEN_HOUR && h.hour < CLOSE_HOUR);
  const outsideHours = hourly.filter((h) => h.hour < OPEN_HOUR || h.hour >= CLOSE_HOUR).reduce((n, h) => n + h.total, 0);

  const peak = visibleHours.reduce((best, h) => (h.total > best.total ? h : best), { hour: OPEN_HOUR, total: 0, perDay: 0 });
  const maxCell = Math.max(1, ...(report?.heatmap.flatMap((row) => row.slice(OPEN_HOUR, CLOSE_HOUR)) ?? [0]));
  const maxDaily = Math.max(1, ...(report?.daily.map((d) => d.total) ?? [0]));

  const exportCsv = () => {
    if (!report) return;
    const rows: Array<Array<string | number | null>> = [
      ['Queue report', `${report.start} to ${report.end}`],
      [],
      ['Summary'],
      ['Tickets', report.summary.total],
      ['Completed', report.summary.completed],
      ['Cancelled / no-show', report.summary.cancelled],
      ['Days with tickets', report.summary.days_open],
      ['Average wait (min)', report.summary.avg_wait_minutes],
      ['Longest wait (min)', report.summary.max_wait_minutes],
      ['Average service (min)', report.summary.avg_service_minutes],
      [],
      ['Per day'],
      ['Date', 'Tickets', 'Completed', 'Average wait (min)', 'Average service (min)'],
      ...report.daily.map((d) => [d.date, d.total, d.completed, d.avg_wait_minutes, d.avg_service_minutes]),
      [],
      ['Per queue'],
      ['Queue', 'Tickets', 'Completed', 'Average wait (min)', 'Average service (min)'],
      ...report.by_queue.map((q) => [
        QUEUE_META[q.queue_type as QueueType]?.label ?? q.queue_type,
        q.total,
        q.completed,
        q.avg_wait_minutes,
        q.avg_service_minutes,
      ]),
      [],
      ['Per counter'],
      ['Counter', 'Served', 'Average service (min)'],
      ...report.by_counter.map((c) => [c.counter_name, c.served, c.avg_service_minutes]),
      [],
      ['Tickets by arrival hour (all days in range)'],
      ['Day', ...Array.from({ length: 24 }, (_, h) => hourLabel(h))],
      ...WEEKDAYS.map((name, i) => [name, ...report.heatmap[i]]),
    ];
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `queue-report-${report.start}_to_${report.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = report?.summary;
  const completionRate = s && s.total > 0 ? Math.round((s.completed / s.total) * 100) : null;

  return (
    <div className="space-y-6">
      {/* Range */}
      <div className="card">
        <div className="card-header flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => {
              const [ps, pe] = p.range();
              const active = ps === start && pe === end;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setStart(ps);
                    setEnd(pe);
                  }}
                  className={`btn btn-sm py-1.5 ${active ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <label htmlFor="report-from">From</label>
            <input
              id="report-from"
              type="date"
              value={start}
              max={end}
              onChange={(e) => e.target.value && setStart(e.target.value)}
              className="input w-auto py-1.5"
            />
            <label htmlFor="report-to">to</label>
            <input
              id="report-to"
              type="date"
              value={end}
              min={start}
              onChange={(e) => e.target.value && setEnd(e.target.value)}
              className="input w-auto py-1.5"
            />
            <button onClick={load} disabled={loading} className="btn btn-secondary btn-sm py-2" title="Reload">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={exportCsv} disabled={!report} className="btn btn-secondary btn-sm py-2">
              <Download className="w-4 h-4" />
              Export report
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {report && s && (
        <>
          {s.total === 0 && (
            <div className="card p-6 text-center text-sm text-slate-500">No tickets were issued in this period.</div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="text-sm text-slate-500">Tickets issued</div>
              <div className="text-3xl font-semibold tabular-nums text-slate-900 mt-1">{s.total}</div>
              <div className="text-xs text-slate-500 mt-1">
                over {s.days_open} day{s.days_open === 1 ? '' : 's'} with tickets
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-slate-500">Completed</div>
              <div className="text-3xl font-semibold tabular-nums text-slate-900 mt-1">{s.completed}</div>
              <div className="text-xs text-slate-500 mt-1">
                {completionRate === null ? '—' : `${completionRate}% of tickets`}
                {s.cancelled > 0 && ` · ${s.cancelled} cancelled or no-show`}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-slate-500">Average wait</div>
              <div className="text-3xl font-semibold tabular-nums text-slate-900 mt-1">
                {s.avg_wait_minutes ?? '—'}
                {s.avg_wait_minutes !== null && <span className="text-base font-normal text-slate-500"> min</span>}
              </div>
              <div className="text-xs text-slate-500 mt-1">Longest: {mins(s.max_wait_minutes)}</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-slate-500">Average service</div>
              <div className="text-3xl font-semibold tabular-nums text-slate-900 mt-1">
                {s.avg_service_minutes ?? '—'}
                {s.avg_service_minutes !== null && <span className="text-base font-normal text-slate-500"> min</span>}
              </div>
              <div className="text-xs text-slate-500 mt-1">Completed tickets only</div>
            </div>
          </div>

          {/* Tickets per day (only when the range has more than one day) */}
          {report.daily.length > 1 && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Tickets per day</h2>
            </div>
            <div className="p-5 overflow-x-auto">
              <div className="flex items-end gap-1 h-40" style={{ minWidth: report.daily.length * 14 }}>
                {report.daily.map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 min-w-[10px] h-full flex flex-col justify-end items-stretch group"
                    title={`${shortDate(d.date)}: ${d.total} tickets, ${d.completed} completed`}
                  >
                    <div
                      className="rounded-t bg-emerald-700 group-hover:bg-emerald-800"
                      style={{ height: `${(d.total / maxDaily) * 100}%`, minHeight: d.total > 0 ? 2 : 0 }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-2">
                <span>{shortDate(report.daily[0].date)}</span>
                <span>Busiest day: {maxDaily} tickets</span>
                <span>{shortDate(report.daily[report.daily.length - 1].date)}</span>
              </div>
            </div>
          </div>
          )}

          {/* Heatmap */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Busy times</h2>
              <span className="text-sm text-slate-500">
                {peak.total > 0 ? (
                  <>
                    Busiest hour: <span className="font-semibold text-slate-800">{hourLabel(peak.hour)}</span> (about{' '}
                    {peak.perDay.toFixed(1)} tickets a day) · darker = more tickets
                  </>
                ) : (
                  'Darker means more tickets'
                )}
              </span>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="border-separate border-spacing-1 text-xs" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th />
                    {visibleHours.map((h) => (
                      <th key={h.hour} className="font-normal text-slate-500 px-1">
                        {hourLabel(h.hour).replace(' ', '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WEEKDAYS.map((name, d) => (
                    <tr key={name}>
                      <th className="font-medium text-slate-600 text-left pr-2 whitespace-nowrap">{name.slice(0, 3)}</th>
                      {visibleHours.map((h) => {
                        const n = report.heatmap[d][h.hour];
                        const strength = n / maxCell;
                        return (
                          <td
                            key={h.hour}
                            title={`${name} ${hourLabel(h.hour)}: ${n} ticket${n === 1 ? '' : 's'}`}
                            className="h-8 min-w-[32px] rounded text-center tabular-nums"
                            style={{
                              backgroundColor: n === 0 ? 'rgb(241 245 249)' : `rgba(4, 120, 87, ${0.15 + strength * 0.85})`,
                              color: strength > 0.5 ? '#fff' : '#334155',
                            }}
                          >
                            {n > 0 ? n : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {outsideHours > 0 && (
                <p className="text-xs text-amber-700 mt-3">
                  {outsideHours} ticket{outsideHours === 1 ? ' was' : 's were'} issued outside 6 AM to 5 PM and
                  {outsideHours === 1 ? ' is' : ' are'} not shown in the two charts above (still counted in the totals).
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By queue */}
            <div className="card overflow-hidden">
              <div className="card-header">
                <h2 className="card-title">By queue</h2>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-5 font-medium">Queue</th>
                    <th className="py-2.5 px-3 font-medium">Tickets</th>
                    <th className="py-2.5 px-3 font-medium">Avg wait</th>
                    <th className="py-2.5 px-3 font-medium">Avg service</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.by_queue.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">
                        No data
                      </td>
                    </tr>
                  )}
                  {report.by_queue.map((q) => (
                    <tr key={q.queue_type}>
                      <td className="py-2.5 px-5 font-medium text-slate-800">
                        {QUEUE_META[q.queue_type as QueueType]?.label ?? q.queue_type}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums">{q.total}</td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-600">{mins(q.avg_wait_minutes)}</td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-600">{mins(q.avg_service_minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* By counter */}
            <div className="card overflow-hidden">
              <div className="card-header">
                <h2 className="card-title">By counter</h2>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-5 font-medium">Counter</th>
                    <th className="py-2.5 px-3 font-medium">Served</th>
                    <th className="py-2.5 px-3 font-medium">Avg service</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.by_counter.map((c) => (
                    <tr key={c.counter_id}>
                      <td className="py-2.5 px-5 font-medium text-slate-800">{c.counter_name}</td>
                      <td className="py-2.5 px-3 tabular-nums">{c.served}</td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-600">{mins(c.avg_service_minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}
    </div>
  );
};
