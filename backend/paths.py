"""
Where the server keeps its files.

Development (python main.py / start_server.bat): everything stays where it
always was, next to the code.

Installed (QueueServer.exe built by PyInstaller): program files are read-only
and replaced on every upgrade, so
  - the database, backups, logs and secret key live in %ProgramData%\\QueueSystem
  - the web pages and downloadable station files sit next to the exe

QUEUE_DATA_DIR / QUEUE_WEB_DIR / QUEUE_DOWNLOADS_DIR override these (used for testing).
"""
import os
import secrets
import sys

FROZEN = getattr(sys, "frozen", False)

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_DIR = os.path.dirname(_BACKEND_DIR)

if FROZEN:
    APP_DIR = os.path.dirname(os.path.abspath(sys.executable))
    _default_data = os.path.join(os.environ.get("PROGRAMDATA", APP_DIR), "QueueSystem")
    _default_web = os.path.join(APP_DIR, "web")
    _default_downloads = os.path.join(APP_DIR, "downloads")
else:
    APP_DIR = _BACKEND_DIR
    _default_data = _BACKEND_DIR
    _default_web = os.path.join(_PROJECT_DIR, "frontend", "dist")
    _default_downloads = os.path.join(_PROJECT_DIR, "downloads")

DATA_DIR = os.environ.get("QUEUE_DATA_DIR") or _default_data
WEB_DIR = os.environ.get("QUEUE_WEB_DIR") or _default_web
DOWNLOADS_DIR = os.environ.get("QUEUE_DOWNLOADS_DIR") or _default_downloads

DB_PATH = os.path.join(DATA_DIR, "queue.db")
BACKUPS_DIR = os.path.join(DATA_DIR, "backups")
LOG_DIR = os.path.join(DATA_DIR, "logs")


def get_secret_key() -> str:
    """
    Key that signs login tokens. Generated once per installation and kept in the
    data folder, so no two offices share a key and restarts keep people signed in.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, "secret.key")
    try:
        with open(path, "r", encoding="utf-8") as f:
            key = f.read().strip()
        if len(key) >= 32:
            return key
    except OSError:
        pass
    key = secrets.token_hex(32)
    with open(path, "w", encoding="utf-8") as f:
        f.write(key)
    return key
