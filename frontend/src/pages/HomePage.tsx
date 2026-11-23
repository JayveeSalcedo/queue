import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueue } from '../context/QueueContext';
import { api } from '../services/api';
import { QUEUE_META } from '../queueStyles';
import { ShieldCheck, Settings, Network, ArrowRight, Tv, Headset, TriangleAlert } from 'lucide-react';

export const HomePage: React.FC = () => {
  const { waitingCounts } = useQueue();
  const [networkInfo, setNetworkInfo] = useState<{ primary_ip: string; ip_addresses: string[]; port: number; fixed_ip: string | null; ip_changed: boolean } | null>(null);

  useEffect(() => {
    api.getNetworkInfo().then(setNetworkInfo).catch(() => {});
  }, []);

  // The server PC may have one address per connection (LAN cable and Wi-Fi)
  const serverIps = networkInfo?.ip_addresses?.length
    ? networkInfo.ip_addresses
    : [networkInfo?.primary_ip || window.location.hostname];
  const serverPort = networkInfo?.port || 8000;

  const stations = [
    {
      title: 'Guard Station',
      desc: 'Issue tickets and print 58mm receipts.',
      to: '/guard',
      icon: ShieldCheck,
      iconClass: 'bg-slate-100 text-slate-700',
      meta: `${waitingCounts.TOTAL} waiting`,
    },
    {
      title: 'Counter 1',
      desc: 'Regular queue — general inquiries and transactions.',
      to: '/counter/1',
      icon: Headset,
      iconClass: QUEUE_META.REGULAR.chip,
      meta: `${waitingCounts.REGULAR} waiting`,
    },
    {
      title: 'Counter 2',
      desc: 'Priority queue — senior citizens, PWD and pregnant women.',
      to: '/counter/2',
      icon: Headset,
      iconClass: QUEUE_META.PRIORITY.chip,
      meta: `${waitingCounts.PRIORITY} waiting`,
    },
    {
      title: 'Counter 3',
      desc: 'Request / complaint queue — formal requests and complaints.',
      to: '/counter/3',
      icon: Headset,
      iconClass: QUEUE_META.COMPLAINT.chip,
      meta: `${waitingCounts.COMPLAINT} waiting`,
    },
    {
      title: 'Public Display',
      desc: 'Waiting-area TV with chime and voice announcements.',
      to: '/display',
      icon: Tv,
      iconClass: 'bg-slate-100 text-slate-700',
      meta: 'No sign-in',
    },
    {
      title: 'Administration',
      desc: 'Reports, ticket logs, the TV display and settings.',
      to: '/admin',
      icon: Settings,
      iconClass: 'bg-slate-100 text-slate-700',
      meta: 'Admin only',
    },
  ];

  return (
    <div className="page space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">Select a station to open, or use the network address to connect another device.</p>
        </div>

        {/* Network address for connecting other devices */}
        <div className="card px-4 py-3 flex items-center gap-3 lg:max-w-sm">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Network className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-500">
              {serverIps.length > 1
                ? 'Open from other PCs or phones (use the address of their network)'
                : 'Open from other PCs or phones on the office network'}
            </div>
            {serverIps.map((ip) => (
              <div key={ip} className="text-sm font-semibold text-slate-900 font-mono select-all truncate">
                http://{ip}:{serverPort}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The installer fixed this PC's address, but it is no longer on it */}
      {networkInfo?.ip_changed && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            This PC's address changed from <span className="font-mono font-semibold">{networkInfo.fixed_ip}</span> to{' '}
            <span className="font-mono font-semibold">{networkInfo.primary_ip}</span>. Phones, counters and the TV
            that use the old address will not connect until they use the new one.
          </div>
        </div>
      )}

      {/* Live summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-slate-500">Waiting now</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{waitingCounts.TOTAL}</div>
        </div>
        {(['REGULAR', 'PRIORITY', 'COMPLAINT'] as const).map((q) => (
          <div key={q} className="card p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className={`w-2 h-2 rounded-full ${QUEUE_META[q].dot}`} />
              {QUEUE_META[q].label}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{waitingCounts[q]}</div>
          </div>
        ))}
      </div>

      {/* Station Cards Grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Stations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stations.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.to}
                to={s.to}
                className="card group p-5 flex flex-col hover:border-emerald-300 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.iconClass}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs text-slate-500">{s.meta}</span>
                </div>

                <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed flex-1">{s.desc}</p>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-slate-400 truncate">{s.to}</span>
                  <span className="flex items-center gap-1 font-medium text-emerald-800 group-hover:gap-1.5 transition-all">
                    Open
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};
