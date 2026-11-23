from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timedelta
import os
import shutil
import aiosqlite
from typing import Dict

from database import get_db
from paths import DB_PATH, BACKUPS_DIR
from auth import require_role
from websocket_manager import ws_manager

router = APIRouter(prefix="/api/admin", tags=["Admin"])

@router.get("/metrics")
async def get_metrics(
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN"))
):
    today = datetime.now().strftime("%Y-%m-%d")

    # Status counts for today
    cursor = await db.execute("""
        SELECT status, COUNT(*) as cnt 
        FROM tickets 
        WHERE session_date = ? 
        GROUP BY status
    """, (today,))
    rows = await cursor.fetchall()
    status_counts = {"TOTAL": 0, "WAITING": 0, "CALLED": 0, "SERVING": 0, "COMPLETED": 0, "SKIPPED": 0, "CANCELLED": 0}
    for r in rows:
        st = r["status"]
        if st in status_counts:
            status_counts[st] = r["cnt"]
        status_counts["TOTAL"] += r["cnt"]

    # Queue type counts for today
    cursor = await db.execute("""
        SELECT queue_type, COUNT(*) as cnt 
        FROM tickets 
        WHERE session_date = ? 
        GROUP BY queue_type
    """, (today,))
    q_rows = await cursor.fetchall()
    queue_counts = {r["queue_type"]: r["cnt"] for r in q_rows}

    # Counter performance (completed tickets per counter)
    cursor = await db.execute("""
        SELECT c.id, c.name, COUNT(t.id) as served_count
        FROM counters c
        LEFT JOIN tickets t ON t.counter_id = c.id AND t.status = 'COMPLETED' AND t.session_date = ?
        GROUP BY c.id
    """, (today,))
    counter_rows = await cursor.fetchall()
    counter_perf = [
        {"counter_id": r["id"], "counter_name": r["name"], "served_count": r["served_count"]}
        for r in counter_rows
    ]

    # Calculate average wait time (minutes) and service time (minutes) for today
    cursor = await db.execute("""
        SELECT 
            AVG((strftime('%s', called_at) - strftime('%s', created_at)) / 60.0) as avg_wait_minutes,
            AVG((strftime('%s', completed_at) - strftime('%s', called_at)) / 60.0) as avg_service_minutes
        FROM tickets
        WHERE session_date = ? AND called_at IS NOT NULL
    """, (today,))
    time_row = await cursor.fetchone()
    avg_wait = round(time_row["avg_wait_minutes"] or 0, 1)
    avg_service = round(time_row["avg_service_minutes"] or 0, 1)

    return {
        "session_date": today,
        "status_counts": status_counts,
        "queue_counts": queue_counts,
        "counter_performance": counter_perf,
        "avg_wait_minutes": avg_wait,
        "avg_service_minutes": avg_service
    }

def _parse_day(value: str, name: str) -> str:
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {name} date. Use YYYY-MM-DD.")


# Minutes between two timestamps, only for rows where both exist and are in order.
_WAIT_MIN = "(strftime('%s', called_at) - strftime('%s', created_at)) / 60.0"
_SERVICE_MIN = "(strftime('%s', completed_at) - strftime('%s', called_at)) / 60.0"


def _r(value, digits=1):
    return round(value, digits) if value is not None else None


@router.get("/reports")
async def get_reports(
    start: str = Query(..., description="First day, YYYY-MM-DD"),
    end: str = Query(..., description="Last day, YYYY-MM-DD"),
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN"))
):
    """Averages, daily totals, busiest hours and counter throughput for a date range."""
    start = _parse_day(start, "start")
    end = _parse_day(end, "end")
    if end < start:
        raise HTTPException(status_code=400, detail="The end date is before the start date.")
    if (datetime.strptime(end, "%Y-%m-%d") - datetime.strptime(start, "%Y-%m-%d")).days > 365:
        raise HTTPException(status_code=400, detail="Choose a range of one year or less.")

    args = (start, end)

    # Overall summary
    cursor = await db.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(status = 'COMPLETED') AS completed,
            SUM(status = 'CANCELLED') AS cancelled,
            SUM(status = 'SKIPPED') AS skipped,
            COUNT(DISTINCT session_date) AS days_open,
            AVG(CASE WHEN called_at IS NOT NULL THEN {_WAIT_MIN} END) AS avg_wait,
            MAX(CASE WHEN called_at IS NOT NULL THEN {_WAIT_MIN} END) AS max_wait,
            AVG(CASE WHEN status = 'COMPLETED' AND called_at IS NOT NULL THEN {_SERVICE_MIN} END) AS avg_service
        FROM tickets
        WHERE session_date BETWEEN ? AND ?
    """, args)
    row = await cursor.fetchone()
    summary = {
        "total": row["total"] or 0,
        "completed": row["completed"] or 0,
        "cancelled": row["cancelled"] or 0,
        "skipped": row["skipped"] or 0,
        "days_open": row["days_open"] or 0,
        "avg_wait_minutes": _r(row["avg_wait"]),
        "max_wait_minutes": _r(row["max_wait"]),
        "avg_service_minutes": _r(row["avg_service"]),
    }

    # One row per day
    cursor = await db.execute(f"""
        SELECT
            session_date AS day,
            COUNT(*) AS total,
            SUM(status = 'COMPLETED') AS completed,
            AVG(CASE WHEN called_at IS NOT NULL THEN {_WAIT_MIN} END) AS avg_wait,
            AVG(CASE WHEN status = 'COMPLETED' AND called_at IS NOT NULL THEN {_SERVICE_MIN} END) AS avg_service
        FROM tickets
        WHERE session_date BETWEEN ? AND ?
        GROUP BY session_date
        ORDER BY session_date
    """, args)
    by_day = {
        r["day"]: {
            "date": r["day"],
            "total": r["total"],
            "completed": r["completed"] or 0,
            "avg_wait_minutes": _r(r["avg_wait"]),
            "avg_service_minutes": _r(r["avg_service"]),
        }
        for r in await cursor.fetchall()
    }
    # Include days with no tickets so the chart has no gaps
    daily = []
    day = datetime.strptime(start, "%Y-%m-%d")
    last = datetime.strptime(end, "%Y-%m-%d")
    while day <= last:
        key = day.strftime("%Y-%m-%d")
        daily.append(by_day.get(key) or {
            "date": key, "total": 0, "completed": 0, "avg_wait_minutes": None, "avg_service_minutes": None,
        })
        day += timedelta(days=1)

    # Tickets by weekday (0 = Sunday) and hour of arrival: busiest hours and the heatmap
    cursor = await db.execute("""
        SELECT CAST(strftime('%w', created_at) AS INTEGER) AS weekday,
               CAST(strftime('%H', created_at) AS INTEGER) AS hour,
               COUNT(*) AS cnt
        FROM tickets
        WHERE session_date BETWEEN ? AND ?
        GROUP BY weekday, hour
    """, args)
    heatmap = [[0] * 24 for _ in range(7)]
    for r in await cursor.fetchall():
        heatmap[r["weekday"]][r["hour"]] = r["cnt"]

    # Queue types
    cursor = await db.execute(f"""
        SELECT queue_type,
               COUNT(*) AS total,
               SUM(status = 'COMPLETED') AS completed,
               AVG(CASE WHEN called_at IS NOT NULL THEN {_WAIT_MIN} END) AS avg_wait,
               AVG(CASE WHEN status = 'COMPLETED' AND called_at IS NOT NULL THEN {_SERVICE_MIN} END) AS avg_service
        FROM tickets
        WHERE session_date BETWEEN ? AND ?
        GROUP BY queue_type
    """, args)
    by_queue = [
        {
            "queue_type": r["queue_type"],
            "total": r["total"],
            "completed": r["completed"] or 0,
            "avg_wait_minutes": _r(r["avg_wait"]),
            "avg_service_minutes": _r(r["avg_service"]),
        }
        for r in await cursor.fetchall()
    ]

    # Counters (every counter is listed, even one that served nobody)
    cursor = await db.execute(f"""
        SELECT c.id, c.name,
               COUNT(t.id) AS served,
               AVG(CASE WHEN t.called_at IS NOT NULL THEN (strftime('%s', t.completed_at) - strftime('%s', t.called_at)) / 60.0 END) AS avg_service
        FROM counters c
        LEFT JOIN tickets t ON t.counter_id = c.id AND t.status = 'COMPLETED' AND t.session_date BETWEEN ? AND ?
        GROUP BY c.id
        ORDER BY c.id
    """, args)
    by_counter = [
        {
            "counter_id": r["id"],
            "counter_name": r["name"],
            "served": r["served"],
            "avg_service_minutes": _r(r["avg_service"]),
        }
        for r in await cursor.fetchall()
    ]

    return {
        "start": start,
        "end": end,
        "summary": summary,
        "daily": daily,
        "heatmap": heatmap,
        "by_queue": by_queue,
        "by_counter": by_counter,
    }


@router.get("/settings")
async def get_settings(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("SELECT key, value FROM settings")
    rows = await cursor.fetchall()
    return {r["key"]: r["value"] for r in rows}

@router.put("/settings")
async def update_settings(
    new_settings: Dict[str, str],
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN"))
):
    for key, val in new_settings.items():
        await db.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
            (key, str(val), str(val))
        )
    await db.commit()

    # Broadcast updated settings to all screens
    await ws_manager.broadcast_state("SETTINGS_UPDATED", None)
    return {"message": "Settings updated successfully"}

@router.post("/backup-db")
async def backup_database(admin: dict = Depends(require_role("ADMIN"))):
    os.makedirs(BACKUPS_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    backup_filename = f"queue_backup_{timestamp}.db"
    dest_path = os.path.join(BACKUPS_DIR, backup_filename)

    # Use SQLite vacuum into or standard safe file copy
    if os.path.exists(DB_PATH):
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(f"VACUUM INTO '{dest_path.replace(os.sep, '/')}'")
        file_size_kb = round(os.path.getsize(dest_path) / 1024, 2)
        return {
            "message": "Backup created successfully",
            "filename": backup_filename,
            "size_kb": file_size_kb,
            "created_at": datetime.now().isoformat()
        }
    else:
        raise HTTPException(status_code=404, detail="Database file does not exist yet")

@router.get("/backups")
async def list_backups(admin: dict = Depends(require_role("ADMIN"))):
    if not os.path.exists(BACKUPS_DIR):
        return []
    
    files = []
    for f in os.listdir(BACKUPS_DIR):
        if f.endswith(".db"):
            fp = os.path.join(BACKUPS_DIR, f)
            stat = os.stat(fp)
            files.append({
                "filename": f,
                "size_kb": round(stat.st_size / 1024, 2),
                "modified_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            })
    files.sort(key=lambda x: x["modified_at"], reverse=True)
    return files
