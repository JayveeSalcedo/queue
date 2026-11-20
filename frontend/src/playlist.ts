import { Announcement, MediaItem } from './types';

export type PlaylistEntry =
  | { key: string; type: 'video'; id: number; sort_order: number; video: MediaItem }
  | { key: string; type: 'announcement'; id: number; sort_order: number; announcement: Announcement };

/** Videos and announcements as one list, in the order the admin arranged them. */
export const buildPlaylist = (videos: MediaItem[], announcements: Announcement[]): PlaylistEntry[] => {
  const entries: PlaylistEntry[] = [
    ...videos.map((video): PlaylistEntry => ({ key: `v${video.id}`, type: 'video', id: video.id, sort_order: video.sort_order, video })),
    ...announcements.map(
      (announcement): PlaylistEntry => ({ key: `a${announcement.id}`, type: 'announcement', id: announcement.id, sort_order: announcement.sort_order, announcement })
    ),
  ];
  // Same position (items created before they shared one order): videos first, then by id
  return entries.sort(
    (a, b) => a.sort_order - b.sort_order || (a.type === b.type ? a.id - b.id : a.type === 'video' ? -1 : 1)
  );
};

/** What actually plays on the TV: every video, and only the announcements switched on. */
export const playablePlaylist = (videos: MediaItem[], announcements: Announcement[]): PlaylistEntry[] =>
  buildPlaylist(videos, announcements).filter((e) => e.type === 'video' || e.announcement.active);
