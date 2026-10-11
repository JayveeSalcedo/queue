import React, { useState, useEffect } from 'react';
import { useQueue } from '../context/QueueContext';
import { audioService } from '../services/audio';
import { Volume2, VolumeX, Bell, CheckCircle2 } from 'lucide-react';

export const DisplayPage: React.FC = () => {
  const { counters, recentlyServed, waitingCounts, settings, lastCalledTicket, isAudioEnabled, enableAudio } = useQueue();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleScreenClick = async () => {
    if (!audioUnlocked) {
      const ok = await audioService.unlock();
      if (ok) setAudioUnlocked(true);
    }
  };

  const officeName = settings.office_name || 'PANELCO III SOUTHEAST AREA OFFICE';
  const tagline = settings.office_tagline || 'Public Service Queue Management';

  const timeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = currentTime.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Map counters 1, 2, 3
  const c1 = counters.find((c) => c.id === 1);
  const c2 = counters.find((c) => c.id === 2);
  const c3 = counters.find((c) => c.id === 3);

  const isFlashing = (counterId: number) => {
    return lastCalledTicket && lastCalledTicket.counter_id === counterId;
  };

  // Counters 1 and 2 cover each other while one is paused
  const coverPartnerFor = (counterId: number) =>
    counters.find(
      (c) => c.id !== counterId && c.status === 'ACTIVE' && (c.id === 1 || c.id === 2)
    );

  const PausedNotice: React.FC<{ counterId: number }> = ({ counterId }) => {
    const partner = coverPartnerFor(counterId);
    return (
      <div className="my-auto py-8 text-center">
        <span className="text-xs uppercase font-extrabold tracking-widest text-amber-300/80 block mb-3">
          COUNTER CLOSED
        </span>
        <div className="text-5xl sm:text-6xl xl:text-7xl font-black tracking-tight text-amber-400 drop-shadow-md">
          PAUSED
        </div>
        {partner && (
          <p className="mt-4 text-base sm:text-lg font-bold text-white/90 px-2">
            Please proceed to {partner.name}
          </p>
        )}
      </div>
    );
  };

  return (
    <div 
      onClick={handleScreenClick}
      className="min-h-screen bg-slate-900 text-white flex flex-col justify-between p-4 sm:p-6 lg:p-8 select-none overflow-x-hidden cursor-default"
    >
      {/* Click-to-Unlock Audio Banner (for browser autoplay policies) */}
      {!audioUnlocked && (
        <div className="mb-4 bg-amber-400 text-emerald-950 font-black px-4 py-2.5 rounded-2xl flex items-center justify-center space-x-2 text-sm sm:text-base shadow-lg animate-bounce cursor-pointer">
          <Bell className="w-5 h-5 text-emerald-950" />
          <span>Click anywhere on this screen to enable TV chime & voice announcements</span>
        </div>
      )}

      {/* Top Banner */}
      <header className="bg-emerald-950/90 border-b-4 border-amber-400 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-4 text-center md:text-left">
          <img
            src="/logo.png"
            alt="PANELCO III logo"
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white object-contain p-1 shadow-lg shrink-0"
          />
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-wide uppercase font-sans">
              {officeName}
            </h1>
            <p className="text-sm sm:text-base text-amber-300 font-semibold tracking-wider">
              {tagline}
            </p>
          </div>
        </div>

        {/* Live Clock & Audio Toggle */}
        <div className="flex items-center space-x-6">
          <div className="text-center md:text-right font-mono">
            <div className="text-2xl sm:text-3xl font-black text-amber-400 tracking-wider">
              {timeStr}
            </div>
            <div className="text-xs sm:text-sm text-emerald-200 font-medium">
              {dateStr}
            </div>
          </div>

          <button
            onClick={enableAudio}
            className={`p-3 rounded-2xl transition-all shadow-md ${
              isAudioEnabled
                ? 'bg-emerald-800 text-amber-300 hover:bg-emerald-700'
                : 'bg-red-950/80 text-red-300 border border-red-800 animate-pulse'
            }`}
            title={isAudioEnabled ? 'Audio Chime & Speech Enabled' : 'Click to Enable Sound on TV'}
          >
            {isAudioEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Main Now Serving Grid (3 Split Columns) */}
      <main className="my-6 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 flex-1">
        {/* COUNTER 1: REGULAR */}
        <div
          className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-500 shadow-2xl relative overflow-hidden border-4 ${
            isFlashing(1)
              ? 'bg-emerald-900 border-amber-400 ring-8 ring-amber-400/40 animate-call-pulse'
              : c1?.status === 'PAUSED'
              ? 'bg-slate-900/80 border-amber-600/60 opacity-90'
              : 'bg-emerald-950/70 border-emerald-800 hover:border-emerald-700'
          }`}
        >
          {/* Header */}
          <div className="text-center border-b-2 border-emerald-800/80 pb-4">
            <span className="text-amber-400 text-xs sm:text-sm font-extrabold tracking-widest uppercase block mb-1">
              COUNTER 1
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-wider">
              REGULAR QUEUE
            </h2>
          </div>

          {/* Ticket Number */}
          {c1?.status === 'PAUSED' ? (
            <PausedNotice counterId={1} />
          ) : (
            <div className="my-auto py-8 text-center">
              <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-300/80 block mb-2">
                NOW SERVING
              </span>
              <div className="text-7xl sm:text-8xl xl:text-9xl font-black font-mono tracking-tight text-white drop-shadow-md">
                {c1?.current_ticket ? c1.current_ticket.queue_number : '---'}
              </div>
            </div>
          )}

          {/* Counter Status Footer */}
          <div className="bg-emerald-900/50 rounded-2xl p-3 text-center border border-emerald-800/60">
            <span className="text-xs text-amber-200 font-bold uppercase tracking-wider">
              Waiting: {waitingCounts.REGULAR} in line
            </span>
          </div>
        </div>

        {/* COUNTER 2: PRIORITY */}
        <div
          className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-500 shadow-2xl relative overflow-hidden border-4 ${
            isFlashing(2)
              ? 'bg-amber-900/90 border-amber-300 ring-8 ring-amber-300/50 animate-call-pulse'
              : c2?.status === 'PAUSED'
              ? 'bg-slate-900/80 border-amber-600/60 opacity-90'
              : 'bg-amber-950/60 border-amber-800 hover:border-amber-700'
          }`}
        >
          {/* Header */}
          <div className="text-center border-b-2 border-amber-800/80 pb-4">
            <span className="text-amber-400 text-xs sm:text-sm font-extrabold tracking-widest uppercase block mb-1">
              COUNTER 2
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-amber-200 tracking-wider">
              PRIORITY QUEUE
            </h2>
            <span className="text-[11px] text-amber-300/80 block font-semibold">
              Senior Citizens • PWD • Pregnant
            </span>
          </div>

          {/* Ticket Number */}
          {c2?.status === 'PAUSED' ? (
            <PausedNotice counterId={2} />
          ) : (
            <div className="my-auto py-8 text-center">
              <span className="text-xs uppercase font-extrabold tracking-widest text-amber-300/80 block mb-2">
                NOW SERVING
              </span>
              <div className="text-7xl sm:text-8xl xl:text-9xl font-black font-mono tracking-tight text-amber-300 drop-shadow-md">
                {c2?.current_ticket ? c2.current_ticket.queue_number : '---'}
              </div>
            </div>
          )}

          {/* Counter Status Footer */}
          <div className="bg-amber-900/40 rounded-2xl p-3 text-center border border-amber-800/60">
            <span className="text-xs text-amber-200 font-bold uppercase tracking-wider">
              Waiting: {waitingCounts.PRIORITY} in line
            </span>
          </div>
        </div>

        {/* COUNTER 3: REQUEST / COMPLAINT */}
        <div
          className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-500 shadow-2xl relative overflow-hidden border-4 ${
            isFlashing(3)
              ? 'bg-teal-900 border-amber-400 ring-8 ring-amber-400/40 animate-call-pulse'
              : 'bg-teal-950/70 border-teal-800 hover:border-teal-700'
          }`}
        >
          {/* Header */}
          <div className="text-center border-b-2 border-teal-800/80 pb-4">
            <span className="text-amber-400 text-xs sm:text-sm font-extrabold tracking-widest uppercase block mb-1">
              COUNTER 3
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-teal-200 tracking-wider">
              REQUEST / COMPLAINT
            </h2>
            <span className="text-[11px] text-teal-300/80 block font-semibold">
              Inquiries & Formal Requests
            </span>
          </div>

          {/* Ticket Number */}
          <div className="my-auto py-8 text-center">
            <span className="text-xs uppercase font-extrabold tracking-widest text-teal-300/80 block mb-2">
              NOW SERVING
            </span>
            <div className="text-7xl sm:text-8xl xl:text-9xl font-black font-mono tracking-tight text-white drop-shadow-md">
              {c3?.current_ticket ? c3.current_ticket.queue_number : '---'}
            </div>
          </div>

          {/* Counter Status Footer */}
          <div className="bg-teal-900/50 rounded-2xl p-3 text-center border border-teal-800/60">
            <span className="text-xs text-amber-200 font-bold uppercase tracking-wider">
              Waiting: {waitingCounts.COMPLAINT} in line
            </span>
          </div>
        </div>
      </main>

      {/* Bottom Bar: Recently Served Ticker */}
      <footer className="bg-slate-950/80 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-bold uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
            <span>Recently Completed</span>
          </div>
          <div className="flex items-center space-x-2 overflow-x-auto max-w-xl">
            {recentlyServed.length === 0 ? (
              <span className="text-xs text-slate-500 italic">No tickets completed yet</span>
            ) : (
              recentlyServed.map((item, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono font-bold text-xs"
                >
                  {item.queue_number}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="text-xs text-slate-400 font-medium">
          Please proceed to your designated counter when your number is called.
        </div>
      </footer>
    </div>
  );
};
