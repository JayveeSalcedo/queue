r"""
Entry point for the installed server (QueueServer.exe, built with PyInstaller).

An installed server has no console window, so everything it would print goes to
%ProgramData%\QueueSystem\logs\server.log instead. For development keep using
start_server.bat or `python main.py`.
"""
import logging
import os
import sys
from logging.handlers import RotatingFileHandler

from paths import LOG_DIR


def _setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = os.path.join(LOG_DIR, "server.log")
    handler = RotatingFileHandler(log_path, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)

    # Windowed executables have no stdout/stderr; libraries that print would crash
    log_stream = open(log_path, "a", encoding="utf-8", buffering=1)
    if sys.stdout is None:
        sys.stdout = log_stream
    if sys.stderr is None:
        sys.stderr = log_stream


def main():
    _setup_logging()
    log = logging.getLogger("queue")
    port = int(os.environ.get("QUEUE_PORT", "8000"))
    try:
        import uvicorn
        from main import app

        log.info("Starting queue server on port %s", port)
        # log_config=None: keep our file logging instead of uvicorn's console setup
        uvicorn.run(app, host="0.0.0.0", port=port, log_config=None, access_log=False)
    except Exception:
        log.exception("The queue server stopped because of an error")
        raise


if __name__ == "__main__":
    main()
