import React, { useState, useEffect } from 'react';
import { useQueue } from '../context/QueueContext';
import { audioService } from '../services/audio';
import { QUEUE_META } from '../queueStyles';
import { Counter, QueueType } from '../types';
import { DisplayMediaPlayer } from '../components/DisplayMediaPlayer';
import { Volume2, VolumeX, Bell, Phone } from 'lucide-react';

export const DisplayPage: React.FC = () => {
  const { counters, waitingCounts, waitingTickets, coverOrder, settings, media, announcements, lastCalledTicket, isAudioEnabled, enableAudio } = useQueue();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [ducked, setDucked] = useState(false);
  const liveAnnouncements = announcements.filter((a) => a.active);
  const hasMedia = media.length > 0 || liveAnnouncements.length > 0;

  // Lower the infomercial volume while a call is announced (chime + voice take a few seconds)
  useEffect(() => {
    if (!lastCalledTicket) return;
    setDucked(true);
    const t = setTimeout(() => setDucked(false), 10000);
    return () => clearTimeout(t);
  }, [lastCalledTicket]);

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

  // A remote key press or touch counts as the one gesture browsers require, same as a click
  useEffect(() => {
    if (audioUnlocked) return;
    const unlockOnce = () => {
      audioService.unlock().then((ok) => ok && setAudioUnlocked(true));
    };
    window.addEventListener('keydown', unlockOnce, { once: true });
    window.addEventListener('touchstart', unlockOnce, { once: true });
    return () => {
      window.removeEventListener('keydown', unlockOnce);
      window.removeEventListener('touchstart', unlockOnce);
    };
  }, [audioUnlocked]);

  const officeName = settings.office_name || 'PANELCO III SOUTHEAST AREA OFFICE';
  const tagline = settings.office_tagline || 'Public Service Queue Management';

  // Real numbers come from Admin > Settings > Hotline numbers. Until they are set, scroll a
  // neutral welcome message instead of placeholder phone numbers nobody should dial.
  const hotlines = (
    settings.hotline_text || `Welcome to ${officeName} | Please wait for your number to be called`
  )
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

  // The paused counter (1 or 2) whose queue this counter is currently covering, if any
  const coverPartnerOfPaused = (counterId: number) =>
    counters.find((c) => c.id !== counterId && c.status === 'PAUSED' && (c.id === 1 || c.id === 2));

  const panels: Array<{ id: number; queue: QueueType }> = [
    { id: 1, queue: 'REGULAR' },
    { id: 2, queue: 'PRIORITY' },
    { id: 3, queue: 'COMPLAINT' },
  ];

  const renderPanel = (id: number, queue: QueueType, counter?: Counter, compact = false) => {
    const meta = QUEUE_META[queue];
    const flashing = isFlashing(id);
    const paused = counter?.status === 'PAUSED';
    const partner = paused ? coverPartnerFor(id) : undefined;
    // A counter covering for its paused partner (or sharing both lines while both are open) serves
    // both queues, so its "next in line" and waiting count follow the combined call order
    const sharingBothLines =
      settings.priority_balance_always === 'true';
    const covering = !paused && (id === 1 || id === 2) && (sharingBothLines || !!coverPartnerOfPaused(id));
    const byId = new Map(waitingTickets.map((t) => [t.id, t]));
    const nextUp = covering
      ? coverOrder.map((tid) => byId.get(tid)).filter((t): t is NonNullable<typeof t> => !!t).slice(0, 2)
      : waitingTickets.filter((t) => t.queue_type === queue).slice(0, 2);
    const waitingTotal = covering ? waitingCounts.REGULAR + waitingCounts.PRIORITY : waitingCounts[queue];

    // Compact card: used beside the video, three cards stacked in a column
    if (compact) {
      return (
        <section
          className={`relative card rounded-2xl flex flex-col overflow-hidden min-h-0 flex-1 transition-colors duration-500 ${
            flashing ? '!border-amber-400 animate-call-pulse' : ''
          }`}
        >
          <div className={`h-1.5 shrink-0 ${meta.bar}`} />
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 px-5 xl:px-6 py-3 flex flex-col justify-center">
              <div className="text-base xl:text-xl font-semibold uppercase tracking-wider text-slate-600">
                {counter?.name || `Counter ${id}`} · <span className="text-slate-900">{meta.label}</span>
              </div>
              {paused ? (
                <>
                  <div className="mt-1 text-4xl xl:text-5xl font-semibold text-slate-400">On Break</div>
                  {partner && (
                    <p className="mt-1 text-base xl:text-lg text-slate-900">
                      Please proceed to <span className="font-semibold">{partner.name}</span>
                    </p>
                  )}
                </>
              ) : (
                counter?.current_ticket ? (
                  <div className={`mt-1 ticket-no leading-none text-[clamp(3rem,5.5vw,6rem)] ${meta.tvText}`}>
                    {counter.current_ticket.queue_number}
                  </div>
                ) : (
                  <div className="mt-2 text-4xl xl:text-5xl font-semibold text-slate-400">Available</div>
                )
              )}
            </div>

            <div className="w-[38%] shrink-0 border-l border-slate-200 bg-slate-50/60 px-4 xl:px-5 py-3 flex flex-col justify-center">
              {!paused && (
                <>
                  <div className="text-sm xl:text-lg font-semibold uppercase tracking-wider text-slate-600">Next in line</div>
                  {nextUp.length > 0 ? (
                    <ol className="mt-1.5 space-y-1">
                      {nextUp.map((t, i) => (
                        <li key={t.id} className="flex items-center gap-3">
                          <span className="w-7 h-7 xl:w-8 xl:h-8 shrink-0 rounded-full bg-white ring-1 ring-inset ring-slate-300 text-sm xl:text-base font-semibold text-slate-600 flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="ticket-no text-2xl xl:text-4xl font-semibold text-slate-900">{t.queue_number}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="mt-1.5 text-lg xl:text-2xl text-slate-400">No one waiting</div>
                  )}
                </>
              )}
              <div className="mt-2 text-lg xl:text-2xl text-slate-600">
                Waiting <span className="font-semibold tabular-nums text-slate-900">{waitingTotal}</span>
              </div>
            </div>
          </div>
        </section>
      );
    }

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
            <div className="text-base xl:text-xl font-semibold uppercase tracking-wider text-slate-600">
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
              <div className="text-base xl:text-xl font-semibold uppercase tracking-wider text-slate-600">Now serving</div>
              {counter?.current_ticket ? (
                <div className={`mt-2 ticket-no leading-none text-[clamp(4.5rem,9vw,10rem)] ${meta.tvText}`}>
                  {counter.current_ticket.queue_number}
                </div>
              ) : (
                <div className="mt-4 text-5xl xl:text-6xl font-semibold text-slate-400">Available</div>
              )}
            </>
          )}
        </div>

        {/* Next in line */}
        {!paused && (
          <div className="px-6 xl:px-8 pb-6 -mt-2">
            <div className="text-base xl:text-xl font-semibold uppercase tracking-wider text-slate-600 text-center">
              Next in line
            </div>
            <div className="min-h-[9.5rem] xl:min-h-[11.5rem]">
            {nextUp.length > 0 ? (
              <ol className="mt-3 space-y-2 max-w-xs mx-auto">
                {nextUp.map((t, i) => (
                  <li key={t.id} className="flex items-center gap-4 rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200 px-4 py-2">
                    <span className="w-9 h-9 shrink-0 rounded-full bg-white ring-1 ring-inset ring-slate-300 text-base font-semibold text-slate-600 flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="ticket-no text-3xl xl:text-5xl font-semibold text-slate-900">{t.queue_number}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-3 text-center text-xl xl:text-2xl text-slate-400">No one waiting</div>
            )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 xl:px-8 py-4 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between text-xl xl:text-2xl">
          <span className="text-slate-600">Waiting</span>
          <span className="font-semibold tabular-nums text-slate-900">{waitingTotal}</span>
        </div>
      </section>
    );
  };

  return (
    <div
      onClick={handleScreenClick}
      className={`bg-slate-50 text-slate-900 flex flex-col select-none overflow-x-hidden cursor-default ${
        hasMedia ? 'h-screen overflow-y-hidden' : 'min-h-screen'
      }`}
    >
      <div className="h-1.5 bg-gradient-to-r from-emerald-800 via-emerald-700 to-amber-400 shrink-0" />
      <div className="flex-1 min-h-0 flex flex-col gap-4 xl:gap-5 px-6 xl:px-8 py-4 xl:py-5">
      {/* Header */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-center md:text-left">
          <img
            src="/logo.png"
            alt="PANELCO III logo"
            className="w-11 h-11 xl:w-14 xl:h-14 rounded-full bg-white object-contain p-0.5 shrink-0 ring-1 ring-slate-200"
          />
          <div>
            <h1 className="text-xl lg:text-2xl xl:text-3xl font-semibold tracking-tight leading-tight text-slate-900">{officeName}</h1>
            <p className="text-sm xl:text-base text-slate-500">{tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-center md:text-right">
            <div className="text-2xl xl:text-3xl font-semibold tabular-nums leading-tight text-slate-900">{timeStr}</div>
            <div className="text-xs xl:text-sm text-slate-500">{dateStr}</div>
          </div>

          {!audioUnlocked && (
            <span className="hidden md:flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 px-3 py-1 text-xs xl:text-sm">
              <Bell className="w-3.5 h-3.5" />
              Click the screen once to turn on sound
            </span>
          )}

          <button
            onClick={enableAudio}
            className={`p-2 rounded-lg transition-colors ${
              isAudioEnabled
                ? 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'
                : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
            }`}
            title={isAudioEnabled ? 'Audio Chime & Speech Enabled' : 'Click to Enable Sound on TV'}
          >
            {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Now serving */}
      {hasMedia ? (
        <main className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4 xl:gap-5 flex-1 min-h-0">
          <DisplayMediaPlayer
            videos={media}
            announcements={liveAnnouncements}
            announcementSeconds={parseInt(settings.announcement_seconds || '15', 10) || 15}
            soundOn={audioUnlocked && isAudioEnabled}
            ducked={ducked}
          />
          <div className="flex flex-col gap-4 xl:gap-5 min-h-0">
            {panels.map((p) => (
              <React.Fragment key={p.id}>
                {renderPanel(p.id, p.queue, counters.find((c) => c.id === p.id), true)}
              </React.Fragment>
            ))}
          </div>
        </main>
      ) : (
        <main className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
          {panels.map((p) => (
            <React.Fragment key={p.id}>{renderPanel(p.id, p.queue, counters.find((c) => c.id === p.id))}</React.Fragment>
          ))}
        </main>
      )}

      {/* Footer: hotline numbers marquee */}
      <footer className="card rounded-2xl flex items-center overflow-hidden shrink-0">
        <div className="flex items-center gap-2 self-stretch px-6 py-4 bg-emerald-800 text-white shrink-0">
          <Phone className="w-5 h-5 xl:w-6 xl:h-6" />
          <span className="text-sm xl:text-base font-medium uppercase tracking-widest">{settings.hotline_text ? 'Hotlines' : 'Notice'}</span>
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
