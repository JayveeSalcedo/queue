from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
import os
import shutil
import aiosqlite
from typing import Dict

from database import get_db, DB_PATH
from auth import require_role
from websocket_manager import ws_manager

router = APIRouter(prefix="/api/admin", tags=["Admin"])

BACKUPS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backups")

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
