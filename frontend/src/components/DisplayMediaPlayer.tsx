import React, { useEffect, useRef, useState } from 'react';
import { Announcement, MediaItem } from '../types';
import { AnnouncementSlide } from './AnnouncementSlide';
import { PlaylistEntry, playablePlaylist } from '../playlist';

interface Props {
  videos: MediaItem[];
  announcements: Announcement[];
  /** Seconds each announcement stays up before the next item starts */
  announcementSeconds: number;
  /** True once the TV has been clicked (browser autoplay rule) and the sound toggle is on. */
  soundOn: boolean;
  /** True while a call is being announced: the video drops to a low volume. */
  ducked: boolean;
}

const DUCKED_VOLUME = 0.12;

/** Plays the uploaded videos and posts the announcements in turn, looping back to the start. */
export const DisplayMediaPlayer: React.FC<Props> = ({ videos, announcements, announcementSeconds, soundOn, ducked }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const failures = useRef(0);

  // The admin's order; announcements that are switched off are skipped
  const slots: PlaylistEntry[] = playablePlaylist(videos, announcements);

  // Stay on the current slot when the playlist is edited; fall back to the first if it was removed
  const index = Math.max(0, slots.findIndex((s) => s.key === currentKey));
  const current = slots[index];

  useEffect(() => {
    if (current && current.key !== currentKey) setCurrentKey(current.key);
  }, [current, currentKey]);

  const playNext = () => {
    if (slots.length > 1) setCurrentKey(slots[(index + 1) % slots.length].key);
  };

  // An announcement stays up for a set time, then the next item starts (unless it is the only one)
  useEffect(() => {
    if (!current || current.type !== 'announcement' || slots.length < 2) return;
    const t = setTimeout(playNext, Math.max(5, announcementSeconds) * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key, slots.length, announcementSeconds]);

  // Sound on/off and call-announcement ducking
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !soundOn;
    v.volume = ducked ? DUCKED_VOLUME : 1;
  }, [soundOn, ducked, current?.key]);

  if (!current) return null;

  const startPlayback = () => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {
      // The browser refused to start with sound: play silently instead of staying frozen
      v.muted = true;
      v.play().catch(() => {});
    });
  };

  if (current.type === 'announcement') {
    const a = current.announcement;
    return (
      <section className="card rounded-2xl overflow-hidden h-full min-h-[16rem]">
        <AnnouncementSlide key={current.key} title={a.title} subtitle={a.subtitle} body={a.body} />
      </section>
    );
  }

  return (
    <section className="card rounded-2xl overflow-hidden bg-black h-full min-h-[16rem]">
      <video
        ref={videoRef}
        key={current.key}
        src={current.video.url}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        muted={!soundOn}
        loop={slots.length === 1}
        onLoadedData={() => {
          failures.current = 0;
          startPlayback();
        }}
        onEnded={playNext}
        onError={() => {
          // A broken file must not stall the loop; stop retrying once every video has failed
          failures.current += 1;
          if (failures.current < slots.length) setTimeout(playNext, 1000);
        }}
      />
    </section>
  );
};
