import React, { useState, useEffect } from 'react';
import { useQueue } from '../context/QueueContext';
import { audioService } from '../services/audio';
import { QUEUE_META } from '../queueStyles';
import { Counter, QueueType } from '../types';
import { Volume2, VolumeX, Bell, Phone } from 'lucide-react';

// Sample text; the real numbers are set in Admin > Settings > Hotline numbers
const DEFAULT_HOTLINES =
  'Billing & Inquiries: (000) 000-0000 | Power Interruptions: (000) 000-0000 | Emergency: 000-0000';

export const DisplayPage: React.FC = () => {
  const { counters, waitingCounts, waitingTickets, settings, lastCalledTicket, isAudioEnabled, enableAudio } = useQueue();
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

  const hotlines = (settings.hotline_text || DEFAULT_HOTLINES)
    .split('|')
    .map((h) => h.trim())
    .filter(Boolean);

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
    const nextUp = waitingTickets.filter((t) => t.queue_type === queue).slice(0, 2);

    return (
      <section
        className={`relative card rounded-2xl flex flex-col overflow-hidden transition-colors duration-500 ${
          flashing ? '!border-amber-400 animate-call-pulse' : ''
        }`}
      >
        <div className={`h-1.5 ${meta.bar}`} />

        {/* Header */}
        <div className="px-6 xl:px-8 pt-6 pb-5 border-b border-slate-200 flex items-baseline justify-between gap-4">
          <div>
            <div className="text-sm xl:text-base font-medium uppercase tracking-widest text-slate-500">
              {counter?.name || `Counter ${id}`}
            </div>
            <h2 className="mt-1 text-2xl xl:text-3xl font-semibold text-slate-900">{meta.label}</h2>
          </div>
          {queue === 'PRIORITY' && (
            <span className="hidden xl:block text-sm text-slate-500 text-right">Seniors · PWD · Pregnant</span>
          )}
        </div>

        {/* Ticket number */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
          {paused ? (
            <>
              <div className="text-sm font-medium uppercase tracking-widest text-amber-600">Counter closed</div>
              <div className="mt-3 text-5xl xl:text-6xl font-semibold text-slate-400">On Break</div>
              {partner && (
                <p className="mt-5 text-xl xl:text-2xl text-slate-900">
                  Please proceed to <span className="font-semibold">{partner.name}</span>
                </p>
              )}
            </>
          ) : (
            <>
              <div className="text-sm font-medium uppercase tracking-widest text-slate-500">Now serving</div>
              <div
                className={`mt-2 ticket-no leading-none text-[clamp(4.5rem,9vw,10rem)] ${
                  counter?.current_ticket ? meta.tvText : 'text-slate-300'
                }`}
              >
                {counter?.current_ticket ? counter.current_ticket.queue_number : '—'}
              </div>
            </>
          )}
        </div>

        {/* Next in line */}
        {!paused && (
          <div className="px-6 xl:px-8 pb-6 -mt-2">
            <div className="text-sm xl:text-base font-medium uppercase tracking-widest text-slate-500 text-center">
              Next in line
            </div>
            {nextUp.length > 0 ? (
              <ol className="mt-3 space-y-2 max-w-xs mx-auto">
                {nextUp.map((t, i) => (
                  <li key={t.id} className="flex items-center gap-4 rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200 px-4 py-2">
                    <span className="w-7 h-7 shrink-0 rounded-full bg-white ring-1 ring-inset ring-slate-300 text-sm font-semibold text-slate-500 flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="ticket-no text-2xl xl:text-4xl font-semibold text-slate-900">{t.queue_number}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-3 text-center text-lg text-slate-400">No one waiting</div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 xl:px-8 py-4 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between text-lg">
          <span className="text-slate-500">Waiting</span>
          <span className="font-semibold tabular-nums text-slate-900">{waitingCounts[queue]}</span>
        </div>
      </section>
    );
  };

  return (
    <div
      onClick={handleScreenClick}
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col select-none overflow-x-hidden cursor-default"
    >
      <div className="h-1.5 bg-gradient-to-r from-emerald-800 via-emerald-700 to-amber-400 shrink-0" />
      <div className="flex-1 flex flex-col gap-6 p-6 xl:p-8">
      {/* Click-to-unlock audio notice (browser autoplay policies) */}
      {!audioUnlocked && (
        <div className="rounded-lg bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 px-4 py-2.5 flex items-center justify-center gap-2 text-sm cursor-pointer">
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
            className="w-16 h-16 xl:w-20 xl:h-20 rounded-full bg-white object-contain p-0.5 shrink-0 ring-1 ring-slate-200"
          />
          <div>
            <h1 className="text-2xl lg:text-3xl xl:text-4xl font-semibold tracking-tight text-slate-900">{officeName}</h1>
            <p className="mt-1 text-base xl:text-lg text-slate-500">{tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-center md:text-right">
            <div className="text-3xl xl:text-4xl font-semibold tabular-nums text-slate-900">{timeStr}</div>
            <div className="text-sm xl:text-base text-slate-500">{dateStr}</div>
          </div>

          <button
            onClick={enableAudio}
            className={`p-3 rounded-xl transition-colors ${
              isAudioEnabled
                ? 'bg-white text-slate-700 border border-slate-300 shadow-sm hover:bg-slate-50'
                : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
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

      {/* Footer: hotline numbers marquee */}
      <footer className="card rounded-2xl flex items-center overflow-hidden">
        <div className="flex items-center gap-2 self-stretch px-6 py-4 bg-emerald-800 text-white shrink-0">
          <Phone className="w-5 h-5 xl:w-6 xl:h-6" />
          <span className="text-sm xl:text-base font-medium uppercase tracking-widest">Hotlines</span>
        </div>
        <div className="flex-1 overflow-hidden marquee-mask">
          <div
            className="marquee-track py-4 text-xl xl:text-3xl font-semibold text-slate-900"
            style={{ animationDuration: `${Math.max(20, hotlines.join('').length * 0.35)}s` }}
          >
            {[0, 1].map((copy) => (
              <div key={copy} className="marquee-group" aria-hidden={copy === 1}>
                {hotlines.map((h, i) => (
                  <span key={i} className="inline-flex items-center">
                    {h}
                    <span className="mx-8 xl:mx-12 text-amber-400">&#9679;</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
};
