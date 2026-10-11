import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueue } from '../context/QueueContext';
import { api } from '../services/api';
import { 
  ShieldCheck, 
  Users, 
  Monitor, 
  Settings, 
  Wifi, 
  QrCode, 
  ArrowRight,
  Tv
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const { settings, waitingCounts } = useQueue();
  const [networkInfo, setNetworkInfo] = useState<{ primary_ip: string; ip_addresses: string[]; port: number } | null>(null);

  useEffect(() => {
    api.getNetworkInfo().then(setNetworkInfo).catch(() => {});
  }, []);

  const officeName = settings.office_name || 'PANELCO III SOUTHEAST AREA OFFICE';
  const serverIp = networkInfo?.primary_ip || window.location.hostname;
  const serverPort = networkInfo?.port || 8000;
  const baseUrl = `http://${serverIp}:${serverPort}`;

  const stations = [
    {
      title: 'Guard Station',
      desc: '1-tap ticket generation & thermal printing for mobile phone',
      to: '/guard',
      color: 'bg-emerald-800 text-white border-emerald-900',
      badge: `${waitingCounts.TOTAL} Total Waiting`,
      icon: ShieldCheck,
      url: `${baseUrl}/guard`,
    },
    {
      title: 'Counter 1 (Regular)',
      desc: 'Calling station for standard citizen service inquiries',
      to: '/counter/1',
      color: 'bg-emerald-700 text-white border-emerald-800',
      badge: `${waitingCounts.REGULAR} in line`,
      icon: Users,
      url: `${baseUrl}/counter/1`,
    },
    {
      title: 'Counter 2 (Priority)',
      desc: 'Dedicated calling station for Seniors, PWD, and Pregnant',
      to: '/counter/2',
      color: 'bg-amber-500 text-emerald-950 border-amber-600',
      badge: `${waitingCounts.PRIORITY} in line`,
      icon: Users,
      url: `${baseUrl}/counter/2`,
    },
    {
      title: 'Counter 3 (Request / Complaint)',
      desc: 'Dedicated station for formal requests and citizen complaints',
      to: '/counter/3',
      color: 'bg-teal-700 text-white border-teal-800',
      badge: `${waitingCounts.COMPLAINT} in line`,
      icon: Users,
      url: `${baseUrl}/counter/3`,
    },
    {
      title: 'Public Display Screen',
      desc: 'Large TV waiting area screen with voice audio & chime',
      to: '/display',
      color: 'bg-slate-900 text-white border-slate-800',
      badge: 'Open Access (No Login)',
      icon: Tv,
      url: `${baseUrl}/display`,
    },
    {
      title: 'Admin Management',
      desc: 'Metrics dashboard, CSV exports, DB backups & settings',
      to: '/admin',
      color: 'bg-slate-800 text-white border-slate-900',
      badge: 'Management Only',
      icon: Settings,
      url: `${baseUrl}/admin`,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Hero Welcome */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 rounded-3xl p-8 text-white shadow-xl border-4 border-amber-400">
        <div className="max-w-3xl">
          <div className="inline-block px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 font-bold text-xs uppercase tracking-wider mb-3 border border-amber-400/30">
            Offline LAN-Only Queue Network
          </div>
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="PANELCO III logo"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white object-contain p-1 shadow-lg shrink-0"
            />
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{officeName}</h1>
          </div>
          <p className="mt-2 text-sm sm:text-base text-emerald-200 font-medium">
            Internet is optional. Local network is required. All workstations and smart TVs connect directly to this office PC.
          </p>

          {/* Network IP Guide */}
          <div className="mt-6 p-4 rounded-2xl bg-emerald-900/80 border border-emerald-700 inline-block">
            <div className="flex items-center space-x-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
              <Wifi className="w-4 h-4" />
              <span>Office PC Local Address:</span>
            </div>
            <div className="mt-1 font-mono font-black text-lg text-white select-all">
              {baseUrl}
            </div>
            <p className="text-[11px] text-emerald-300 mt-0.5">
              Open this URL on phones, tablets, and smart TVs connected to the office Wi-Fi / router.
            </p>
          </div>
        </div>
      </div>

      {/* Station Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stations.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.to}
              to={s.to}
              className={`rounded-3xl p-6 shadow-md hover:shadow-xl transition-all transform hover:-translate-y-1 border-2 flex flex-col justify-between ${s.color}`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20">
                    <Icon className="w-6 h-6 text-amber-300" />
                  </div>
                  <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-black/20 border border-white/10">
                    {s.badge}
                  </span>
                </div>

                <h3 className="text-xl font-black tracking-tight mb-1">{s.title}</h3>
                <p className="text-xs opacity-80 leading-relaxed mb-4">{s.desc}</p>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs font-bold">
                <span className="font-mono opacity-70 truncate max-w-[180px]">{s.url}</span>
                <span className="flex items-center space-x-1 text-amber-300">
                  <span>Open</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
