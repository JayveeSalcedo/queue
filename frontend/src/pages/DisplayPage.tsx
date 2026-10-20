import React, { useState, useEffect } from 'react';
import { useQueue } from '../context/QueueContext';
import { audioService } from '../services/audio';
import { QUEUE_META } from '../queueStyles';
import { Counter, QueueType } from '../types';
import { Volume2, VolumeX, Bell } from 'lucide-react';

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

  const timeStr = currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dateStr = currentTime.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const isFlashing = (counterId: number) => {
    return !!lastCalledTicket && lastCalledTicket.counter_id === counterId;
  };

  // Counters 1 and 2 cover each other while one is paused
  const coverPartnerFor = (counterId: number) =>
    counters.find(
      (c) => c.id !== counterId && c.status === 'ACTIVE' && (c.id === 1 || c.id === 2)
    );

  const panels: Array<{ id: number; queue: QueueType }> = [
    { id: 1, queue: 'REGULAR' },
    { id: 2, queue: 'PRIORITY' },
    { id: 3, queue: 'COMPLAINT' },
  ];

  const renderPanel = (id: number, queue: QueueType, counter?: Counter) => {
    const meta = QUEUE_META[queue];
    const flashing = isFlashing(id);
    const paused = counter?.status === 'PAUSED';
    const partner = paused ? coverPartnerFor(id) : undefined;

    return (
      <section
        className={`relative rounded-2xl bg-slate-900 border flex flex-col overflow-hidden transition-colors duration-500 ${
          flashing ? 'border-amber-400 animate-call-pulse' : 'border-slate-800'
        }`}
      >
        <div className={`h-1.5 ${meta.bar}`} />

        {/* Header */}
        <div className="px-6 xl:px-8 pt-6 pb-5 border-b border-slate-800 flex items-baseline justify-between gap-4">
          <div>
            <div className="text-sm xl:text-base font-medium uppercase tracking-widest text-slate-400">
              {counter?.name || `Counter ${id}`}
            </div>
            <h2 className="mt-1 text-2xl xl:text-3xl font-semibold text-white">{meta.label}</h2>
          </div>
          {queue === 'PRIORITY' && (
            <span className="hidden xl:block text-sm text-slate-400 text-right">Seniors · PWD · Pregnant</span>
          )}
        </div>

        {/* Ticket number */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
          {paused ? (
            <>
              <div className="text-sm font-medium uppercase tracking-widest text-amber-400">Counter closed</div>
              <div className="mt-3 text-5xl xl:text-6xl font-semibold text-slate-300">Paused</div>
              {partner && (
                <p className="mt-5 text-xl xl:text-2xl text-white">
                  Please proceed to <span className="font-semibold">{partner.name}</span>
                </p>
              )}
            </>
          ) : (
            <>
              <div className="text-sm font-medium uppercase tracking-widest text-slate-400">Now serving</div>
              <div
                className={`mt-2 ticket-no leading-none text-[clamp(4.5rem,9vw,10rem)] ${
                  counter?.current_ticket ? meta.tvText : 'text-slate-700'
                }`}
              >
                {counter?.current_ticket ? counter.current_ticket.queue_number : '—'}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 xl:px-8 py-4 border-t border-slate-800 flex items-center justify-between text-lg">
          <span className="text-slate-400">Waiting</span>
          <span className="font-semibold tabular-nums text-white">{waitingCounts[queue]}</span>
        </div>
      </section>
    );
  };

  return (
    <div
      onClick={handleScreenClick}
      className="min-h-screen bg-slate-950 text-white flex flex-col gap-6 p-6 xl:p-8 select-none overflow-x-hidden cursor-default"
    >
      {/* Click-to-unlock audio notice (browser autoplay policies) */}
      {!audioUnlocked && (
        <div className="rounded-lg bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-400/30 px-4 py-2.5 flex items-center justify-center gap-2 text-sm cursor-pointer">
          <Bell className="w-4 h-4" />
          <span>Click anywhere on this screen to enable chime and voice announcements</span>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-5 text-center md:text-left">
          <img
            src="/logo.png"
            alt="PANELCO III logo"
            className="w-16 h-16 xl:w-20 xl:h-20 rounded-full bg-white object-contain p-0.5 shrink-0"
          />
          <div>
            <h1 className="text-2xl lg:text-3xl xl:text-4xl font-semibold tracking-tight text-white">{officeName}</h1>
            <p className="mt-1 text-base xl:text-lg text-slate-400">{tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-center md:text-right">
            <div className="text-3xl xl:text-4xl font-semibold tabular-nums text-white">{timeStr}</div>
            <div className="text-sm xl:text-base text-slate-400">{dateStr}</div>
          </div>

          <button
            onClick={enableAudio}
            className={`p-3 rounded-xl transition-colors ${
              isAudioEnabled
                ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                : 'bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/40'
            }`}
            title={isAudioEnabled ? 'Audio Chime & Speech Enabled' : 'Click to Enable Sound on TV'}
          >
            {isAudioEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Now serving */}
      <main className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
        {panels.map((p) => (
          <React.Fragment key={p.id}>{renderPanel(p.id, p.queue, counters.find((c) => c.id === p.id))}</React.Fragment>
        ))}
      </main>

      {/* Footer: recently completed */}
      <footer className="rounded-2xl bg-slate-900 border border-slate-800 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-sm font-medium uppercase tracking-widest text-slate-400 shrink-0">Recently served</span>
          <div className="flex items-center gap-2 overflow-hidden">
            {recentlyServed.length === 0 ? (
              <span className="text-sm text-slate-500">None yet</span>
            ) : (
              recentlyServed.map((item, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 rounded-md bg-slate-800 text-slate-200 ticket-no text-base"
                >
                  {item.queue_number}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="text-sm text-slate-400 shrink-0">
          Please proceed to the counter shown when your number is called.
        </div>
      </footer>
    </div>
  );
};
