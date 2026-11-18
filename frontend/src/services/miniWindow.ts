// A small wide strip: buttons only
const MINI_WIDTH = 540;
const MINI_HEIGHT = 150;

export const miniWindowPath = (counterId: number) => `/counter/${counterId}/mini`;

/**
 * Opens the compact counter controller in its own small window, parked at the
 * right edge of the screen. Calling it again focuses the window that is
 * already open instead of opening a second one.
 * Returns false when the browser blocked the pop-up.
 */
export function openMiniWindow(counterId: number): boolean {
  // availLeft / availTop exist in Chrome and Edge (multi-monitor offsets) but not in the TS typings
  const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
  const left = Math.max(0, (screen.availLeft ?? 0) + screen.availWidth - MINI_WIDTH - 24);
  const top = Math.max(0, (screen.availTop ?? 0) + 72);
  const features = `popup=yes,width=${MINI_WIDTH},height=${MINI_HEIGHT},left=${left},top=${top}`;
  const win = window.open(miniWindowPath(counterId), `queue-mini-${counterId}`, features);
  if (!win) return false;
  win.focus();
  return true;
}

export const MINI_WINDOW_SIZE = { width: MINI_WIDTH, height: MINI_HEIGHT };
