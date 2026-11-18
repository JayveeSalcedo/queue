/** Which kind of device this is, to show the right "add to home screen / desktop" steps. */
export function detectPlatform() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  return { isIOS, isAndroid, isWindows, isMobile: isIOS || isAndroid };
}
