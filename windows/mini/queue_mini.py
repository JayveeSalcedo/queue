"""
QueueMini: the counter's small always-on-top window.

A regular browser window can never stay above other programs. This tiny app
shows the same /counter/<n>/mini page inside Windows' built-in WebView2
(the engine behind Edge) in a small wide strip that is pinned on top, so Next / Recall /
Skip / Complete / Pause are always one click away, even over another program.

It is downloaded from the queue server by the "Download Windows shortcuts"
button, so counter PCs install nothing by hand.

    QueueMini.exe --url=http://192.168.1.20:8000/counter/1/mini --counter=1
"""
import argparse
import ctypes
import hashlib
import os
import subprocess
import sys
import threading
import time
import urllib.request

IS_WINDOWS = sys.platform == "win32"


def parse_args():
    p = argparse.ArgumentParser(description="Queue counter mini window")
    p.add_argument("--url", required=True, help="Address of the mini page on the queue server")
    p.add_argument("--counter", type=int, default=0, help="Counter number, used for the window title")
    p.add_argument("--title", default="", help="Window title (default: Counter N)")
    p.add_argument("--width", type=int, default=600)
    p.add_argument("--height", type=int, default=150)
    p.add_argument("--no-topmost", action="store_true", help="Do not keep the window above other programs")
    return p.parse_args()


def only_one_per_address(url: str) -> bool:
    """False when this counter's mini window is already open (a second launch just exits)."""
    if not IS_WINDOWS:
        return True
    name = "QueueMini-" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
    kernel32 = ctypes.windll.kernel32
    kernel32.CreateMutexW(None, False, name)
    return kernel32.GetLastError() != 183  # ERROR_ALREADY_EXISTS


def work_area():
    """(left, top, width, height) of the usable screen, excluding the taskbar."""
    if IS_WINDOWS:
        try:
            from ctypes import wintypes

            rect = wintypes.RECT()
            ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0)  # SPI_GETWORKAREA
            return rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top
        except Exception:
            pass
    return 0, 0, 1366, 768


def server_reachable(url: str) -> bool:
    try:
        urllib.request.urlopen(url, timeout=3).close()
        return True
    except Exception:
        return False


def waiting_page(url: str) -> str:
    """Shown while the server is unreachable; retries on its own every few seconds."""
    return f"""<!doctype html><meta charset="utf-8">
<meta http-equiv="refresh" content="4;url={url}">
<body style="font-family:Segoe UI,sans-serif;background:#f8fafc;color:#0f172a;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:16px">
<div><div style="font-size:18px;font-weight:600">Can't reach the queue server</div>
<p style="color:#64748b;font-size:13px">Check the network cable or Wi-Fi.<br>Trying again automatically...</p></div>"""


def run_in_edge_app_mode(url: str, width: int, height: int) -> bool:
    """Fallback when WebView2 is unavailable: a plain small Edge/Chrome app window (not pinned on top)."""
    candidates = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
    ]
    for exe in candidates:
        if os.path.isfile(exe):
            subprocess.Popen([exe, f"--app={url}", f"--window-size={width},{height}"])
            return True
    return False


def keep_title_in_sync(window, base_title: str):
    """The page puts the current ticket in its title; mirror it so the taskbar shows who is being served."""
    last = None
    while True:
        time.sleep(2)
        try:
            title = window.evaluate_js("document.title")
        except Exception:
            return  # window closed
        if title and title != last:
            last = title
            try:
                window.set_title(title)
            except Exception:
                return


def main():
    args = parse_args()
    url = args.url
    title = args.title or (f"Counter {args.counter}" if args.counter else "Queue")

    if not only_one_per_address(url):
        return

    import webview  # imported late so --help and the mutex check stay fast

    left, top, area_w, _ = work_area()
    x = left + area_w - args.width - 24  # park at the right edge of the screen
    y = top + 72

    reachable = server_reachable(url)
    window = webview.create_window(
        title,
        url=url if reachable else None,
        html=None if reachable else waiting_page(url),
        width=args.width,
        height=args.height,
        x=x,
        y=y,
        min_size=(420, 120),
        on_top=not args.no_topmost,
        text_select=True,
    )

    storage = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "QueueSystem", "webview")
    os.makedirs(storage, exist_ok=True)

    def started():
        threading.Thread(target=keep_title_in_sync, args=(window, title), daemon=True).start()

    try:
        # private_mode=False keeps the sign-in, so staff log in once, not every launch
        webview.start(started, gui="edgechromium" if IS_WINDOWS else None, private_mode=False, storage_path=storage)
    except Exception:
        if not run_in_edge_app_mode(url, args.width, args.height):
            raise


if __name__ == "__main__":
    main()
