import os
import uuid
from typing import List

import aiosqlite
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from auth import require_role
from database import get_db, next_playlist_position
from paths import MEDIA_DIR
from websocket_manager import ws_manager

router = APIRouter(tags=["Media"])

# Formats every browser on the TV PC can play without extra codecs
ALLOWED_EXTENSIONS = {".mp4", ".m4v", ".webm"}
MAX_UPLOAD_BYTES = 1024 * 1024 * 1024  # 1 GB per video
CHUNK_BYTES = 1024 * 1024


class PlaylistEntry(BaseModel):
    type: str  # 'video' or 'announcement'
    id: int


class PlaylistOrderBody(BaseModel):
    items: List[PlaylistEntry]


def _item(row) -> dict:
    return {
        "id": row["id"],
        "original_name": row["original_name"],
        "size_bytes": row["size_bytes"],
        "url": f"/media/{row['filename']}",
        "sort_order": row["sort_order"],
    }


@router.get("/api/media")
async def list_media(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        "SELECT id, filename, original_name, size_bytes, sort_order FROM media ORDER BY sort_order, id"
    )
    return [_item(r) for r in await cursor.fetchall()]


@router.post("/api/admin/media")
async def upload_media(
    file: UploadFile = File(...),
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN")),
):
    original_name = os.path.basename(file.filename or "video")
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only MP4, M4V or WebM videos can be uploaded")

    os.makedirs(MEDIA_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(MEDIA_DIR, filename)

    # Stream to disk so a large video never has to fit in memory
    size = 0
    try:
        with open(path, "wb") as out:
            while True:
                chunk = await file.read(CHUNK_BYTES)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Video is larger than 1 GB")
                out.write(chunk)
    except Exception:
        if os.path.exists(path):
            os.remove(path)
        raise

    next_order = await next_playlist_position(db)
    cursor = await db.execute(
        "INSERT INTO media (filename, original_name, size_bytes, sort_order) VALUES (?, ?, ?, ?)",
        (filename, original_name, size, next_order),
    )
    await db.commit()
    await ws_manager.broadcast_state("SETTINGS_UPDATED", None)
    return {"id": cursor.lastrowid, "original_name": original_name, "size_bytes": size, "url": f"/media/{filename}"}


@router.put("/api/admin/playlist/order")
async def reorder_playlist(
    body: PlaylistOrderBody,
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN")),
):
    """One order for everything on the display: videos and announcements, as dragged by the admin."""
    tables = {"video": "media", "announcement": "announcements"}
    for position, entry in enumerate(body.items, start=1):
        table = tables.get(entry.type)
        if not table:
            raise HTTPException(status_code=400, detail=f"Unknown playlist item type: {entry.type}")
        await db.execute(f"UPDATE {table} SET sort_order = ? WHERE id = ?", (position, entry.id))
    await db.commit()
    await ws_manager.broadcast_state("SETTINGS_UPDATED", None)
    return {"message": "Order saved"}


@router.delete("/api/admin/media/{media_id}")
async def delete_media(
    media_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN")),
):
    cursor = await db.execute("SELECT filename FROM media WHERE id = ?", (media_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Video not found")
    await db.execute("DELETE FROM media WHERE id = ?", (media_id,))
    await db.commit()
    try:
        os.remove(os.path.join(MEDIA_DIR, row["filename"]))
    except OSError:
        pass
    await ws_manager.broadcast_state("SETTINGS_UPDATED", None)
    return {"message": "Video removed"}
