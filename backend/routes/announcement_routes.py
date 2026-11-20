import aiosqlite
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import require_role
from database import get_db, next_playlist_position
from websocket_manager import ws_manager

router = APIRouter(prefix="/api/admin/announcements", tags=["Announcements"])


class AnnouncementBody(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    subtitle: str = Field(default="", max_length=160)
    body: str = Field(default="", max_length=2000)
    active: bool = True


def _item(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "subtitle": row["subtitle"],
        "body": row["body"],
        "active": bool(row["active"]),
        "sort_order": row["sort_order"],
    }


@router.get("")
async def list_announcements(
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN")),
):
    cursor = await db.execute(
        "SELECT id, title, subtitle, body, active, sort_order FROM announcements ORDER BY sort_order, id"
    )
    return [_item(r) for r in await cursor.fetchall()]


@router.post("")
async def create_announcement(
    data: AnnouncementBody,
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN")),
):
    next_order = await next_playlist_position(db)
    cursor = await db.execute(
        "INSERT INTO announcements (title, subtitle, body, active, sort_order) VALUES (?, ?, ?, ?, ?)",
        (data.title.strip(), data.subtitle.strip(), data.body.strip(), int(data.active), next_order),
    )
    await db.commit()
    await ws_manager.broadcast_state("SETTINGS_UPDATED", None)
    return {"id": cursor.lastrowid, **data.model_dump()}


@router.put("/{announcement_id}")
async def update_announcement(
    announcement_id: int,
    data: AnnouncementBody,
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN")),
):
    cursor = await db.execute(
        "UPDATE announcements SET title = ?, subtitle = ?, body = ?, active = ? WHERE id = ?",
        (data.title.strip(), data.subtitle.strip(), data.body.strip(), int(data.active), announcement_id),
    )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")
    await db.commit()
    await ws_manager.broadcast_state("SETTINGS_UPDATED", None)
    return {"id": announcement_id, **data.model_dump()}


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN")),
):
    cursor = await db.execute("DELETE FROM announcements WHERE id = ?", (announcement_id,))
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")
    await db.commit()
    await ws_manager.broadcast_state("SETTINGS_UPDATED", None)
    return {"message": "Announcement removed"}
