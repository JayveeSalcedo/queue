from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
import aiosqlite

from database import get_db
from models import TransferRequest
from websocket_manager import ws_manager
from auth import get_current_user

router = APIRouter(prefix="/api/counters", tags=["Counters"])

class TicketActionBody(BaseModel):
    ticket_id: int

class CounterStatusBody(BaseModel):
    status: str  # 'ACTIVE' or 'PAUSED'


# Queue types whose counters cover for each other when one is paused.
# Counter 3 (COMPLAINT) is deliberately excluded: complaints stay specialised.
COVER_GROUP = ("REGULAR", "PRIORITY")


async def get_servable_queue_types(db, counter) -> list:
    """
    Queue types this counter may call from right now: always its own, plus the
    queue of any paused counter inside the cover group (R <-> P).
    """
    own = counter["queue_type"]
    if own not in COVER_GROUP:
        return [own]

    cursor = await db.execute(
        """
        SELECT DISTINCT queue_type FROM counters
        WHERE status = 'PAUSED' AND id != ? AND queue_type IN (?, ?)
        """,
        (counter["id"], COVER_GROUP[0], COVER_GROUP[1])
    )
    covered = [r["queue_type"] for r in await cursor.fetchall()]
    return [own] + [q for q in covered if q != own]


def next_waiting_ticket_sql(queue_types: list) -> str:
    """
    Oldest waiting ticket across the given queues. PRIORITY is served first when
    a counter is covering both, so seniors/PWD do not queue behind regulars.
    """
    placeholders = ",".join("?" for _ in queue_types)
    return f"""
        SELECT id, queue_number, queue_type, created_at
        FROM tickets
        WHERE status = 'WAITING' AND session_date = ? AND queue_type IN ({placeholders})
        ORDER BY CASE queue_type WHEN 'PRIORITY' THEN 0 ELSE 1 END, number_seq ASC
        LIMIT 1
    """

@router.get("")
async def list_counters(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("""
        SELECT c.id, c.name, c.queue_type, c.status, c.current_ticket_id,
               t.queue_number, t.queue_type as ticket_queue_type, t.status as ticket_status,
               t.called_at, t.serving_at, t.called_by_user
        FROM counters c
        LEFT JOIN tickets t ON c.current_ticket_id = t.id
        ORDER BY c.id ASC
    """)
    rows = await cursor.fetchall()
    counters = []
    for r in rows:
        ticket = None
        if r["current_ticket_id"]:
            ticket = {
                "id": r["current_ticket_id"],
                "queue_number": r["queue_number"],
                "queue_type": r["ticket_queue_type"],
                "status": r["ticket_status"],
                "called_at": r["called_at"],
                "serving_at": r["serving_at"],
                "called_by_user": r["called_by_user"]
            }
        counters.append({
            "id": r["id"],
            "name": r["name"],
            "queue_type": r["queue_type"],
            "status": r["status"],
            "current_ticket_id": r["current_ticket_id"],
            "current_ticket": ticket
        })
    return counters

@router.post("/{counter_id}/call-next")
async def call_next_ticket(
    counter_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    # 1. Fetch counter
    cursor = await db.execute("SELECT id, name, queue_type, status, current_ticket_id FROM counters WHERE id = ?", (counter_id,))
    counter = await cursor.fetchone()
    if not counter:
        raise HTTPException(status_code=404, detail="Counter not found")

    if counter["status"] == "PAUSED":
        raise HTTPException(
            status_code=409,
            detail=f"{counter['name']} is paused. Resume the counter before calling the next customer."
        )

    today = datetime.now().strftime("%Y-%m-%d")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 2. If counter is already serving a ticket, complete it automatically
    if counter["current_ticket_id"]:
        await db.execute(
            """
            UPDATE tickets 
            SET status = 'COMPLETED', completed_at = ? 
            WHERE id = ? AND status IN ('CALLED', 'SERVING')
            """,
            (now_str, counter["current_ticket_id"])
        )

    # 3. Find next waiting ticket across this counter's own queue plus any
    #    queue it is currently covering for a paused counter
    servable = await get_servable_queue_types(db, counter)
    cursor = await db.execute(next_waiting_ticket_sql(servable), (today, *servable))
    next_ticket = await cursor.fetchone()
    if not next_ticket:
        # Clear counter current ticket if none waiting
        await db.execute("UPDATE counters SET current_ticket_id = NULL WHERE id = ?", (counter_id,))
        await db.commit()
        await ws_manager.broadcast_state("NO_TICKETS_WAITING", None)
        return {"message": "No tickets waiting in this queue", "ticket": None}

    # 4. Mark ticket as CALLED
    await db.execute(
        """
        UPDATE tickets 
        SET status = 'CALLED', called_at = ?, serving_at = ?, counter_id = ?, called_by_user = ?
        WHERE id = ?
        """,
        (now_str, now_str, counter_id, user["username"], next_ticket["id"])
    )

    # 5. Assign to counter
    await db.execute("UPDATE counters SET current_ticket_id = ? WHERE id = ?", (next_ticket["id"], counter_id))
    await db.commit()

    called_payload = {
        "id": next_ticket["id"],
        "queue_number": next_ticket["queue_number"],
        "queue_type": next_ticket["queue_type"],
        "counter_id": counter_id,
        "counter_name": counter["name"],
        "called_at": now_str
    }

    # Broadcast state change with announcement payload
    await ws_manager.broadcast_state("CALLED", last_called_ticket=called_payload)

    return {"message": "Called next ticket", "ticket": called_payload}

@router.post("/{counter_id}/call-ticket")
async def call_specific_ticket(
    counter_id: int,
    req: TicketActionBody,
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    cursor = await db.execute("SELECT id, name, queue_type, status, current_ticket_id FROM counters WHERE id = ?", (counter_id,))
    counter = await cursor.fetchone()
    if not counter:
        raise HTTPException(status_code=404, detail="Counter not found")

    if counter["status"] == "PAUSED":
        raise HTTPException(
            status_code=409,
            detail=f"{counter['name']} is paused. Resume the counter before calling a customer."
        )

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Complete current ticket if active
    if counter["current_ticket_id"]:
        await db.execute(
            """
            UPDATE tickets 
            SET status = 'COMPLETED', completed_at = ? 
            WHERE id = ? AND status IN ('CALLED', 'SERVING')
            """,
            (now_str, counter["current_ticket_id"])
        )

    # Fetch requested ticket
    cursor = await db.execute(
        "SELECT id, queue_number, queue_type FROM tickets WHERE id = ? AND status = 'WAITING'",
        (req.ticket_id,)
    )
    ticket = await cursor.fetchone()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found or no longer waiting")

    servable = await get_servable_queue_types(db, counter)
    if ticket["queue_type"] not in servable:
        raise HTTPException(
            status_code=409,
            detail=f"{counter['name']} cannot serve {ticket['queue_type']} tickets"
        )

    await db.execute(
        """
        UPDATE tickets 
        SET status = 'CALLED', called_at = ?, serving_at = ?, counter_id = ?, called_by_user = ?
        WHERE id = ?
        """,
        (now_str, now_str, counter_id, user["username"], req.ticket_id)
    )
    await db.execute("UPDATE counters SET current_ticket_id = ? WHERE id = ?", (req.ticket_id, counter_id))
    await db.commit()

    called_payload = {
        "id": ticket["id"],
        "queue_number": ticket["queue_number"],
        "queue_type": ticket["queue_type"],
        "counter_id": counter_id,
        "counter_name": counter["name"],
        "called_at": now_str
    }

    await ws_manager.broadcast_state("CALLED", last_called_ticket=called_payload)
    return {"message": "Called ticket", "ticket": called_payload}

@router.post("/{counter_id}/recall")
async def recall_ticket(
    counter_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    cursor = await db.execute("SELECT id, name, current_ticket_id FROM counters WHERE id = ?", (counter_id,))
    counter = await cursor.fetchone()
    if not counter or not counter["current_ticket_id"]:
        raise HTTPException(status_code=400, detail="Counter has no active ticket to recall")

    cursor = await db.execute(
        "SELECT id, queue_number, queue_type, called_at FROM tickets WHERE id = ?", 
        (counter["current_ticket_id"],)
    )
    ticket = await cursor.fetchone()
    if not ticket:
        raise HTTPException(status_code=404, detail="Active ticket not found")

    recall_payload = {
        "id": ticket["id"],
        "queue_number": ticket["queue_number"],
        "queue_type": ticket["queue_type"],
        "counter_id": counter_id,
        "counter_name": counter["name"],
        "called_at": ticket["called_at"]
    }

    # Broadcast RECALL to trigger public display chime and voice repeat
    await ws_manager.broadcast_state("RECALLED", last_called_ticket=recall_payload)

    return {"message": "Ticket recalled", "ticket": recall_payload}

@router.post("/{counter_id}/skip")
async def skip_ticket(
    counter_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    cursor = await db.execute("SELECT id, name, current_ticket_id FROM counters WHERE id = ?", (counter_id,))
    counter = await cursor.fetchone()
    if not counter or not counter["current_ticket_id"]:
        raise HTTPException(status_code=400, detail="Counter has no active ticket to skip")

    ticket_id = counter["current_ticket_id"]
    await db.execute("UPDATE tickets SET status = 'SKIPPED' WHERE id = ?", (ticket_id,))
    await db.execute("UPDATE counters SET current_ticket_id = NULL WHERE id = ?", (counter_id,))
    await db.commit()

    await ws_manager.broadcast_state("SKIPPED", None)
    return {"message": "Ticket moved to skipped / holding list"}

@router.post("/{counter_id}/complete")
async def complete_ticket(
    counter_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    cursor = await db.execute("SELECT id, name, current_ticket_id FROM counters WHERE id = ?", (counter_id,))
    counter = await cursor.fetchone()
    if not counter or not counter["current_ticket_id"]:
        raise HTTPException(status_code=400, detail="Counter has no active ticket to complete")

    ticket_id = counter["current_ticket_id"]
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    await db.execute("UPDATE tickets SET status = 'COMPLETED', completed_at = ? WHERE id = ?", (now_str, ticket_id))
    await db.execute("UPDATE counters SET current_ticket_id = NULL WHERE id = ?", (counter_id,))
    await db.commit()

    await ws_manager.broadcast_state("COMPLETED", None)
    return {"message": "Ticket marked as completed"}

@router.post("/{counter_id}/recall-skipped")
async def recall_skipped_ticket(
    counter_id: int,
    req: TicketActionBody,
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    cursor = await db.execute("SELECT id, name, current_ticket_id FROM counters WHERE id = ?", (counter_id,))
    counter = await cursor.fetchone()
    if not counter:
        raise HTTPException(status_code=404, detail="Counter not found")

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # If counter is serving another ticket, complete it
    if counter["current_ticket_id"]:
        await db.execute(
            "UPDATE tickets SET status = 'COMPLETED', completed_at = ? WHERE id = ?",
            (now_str, counter["current_ticket_id"])
        )

    # Re-activate skipped ticket
    cursor = await db.execute("SELECT id, queue_number, queue_type FROM tickets WHERE id = ? AND status = 'SKIPPED'", (req.ticket_id,))
    ticket = await cursor.fetchone()
    if not ticket:
        raise HTTPException(status_code=404, detail="Skipped ticket not found or no longer skipped")

    await db.execute(
        "UPDATE tickets SET status = 'CALLED', counter_id = ?, called_at = ?, called_by_user = ? WHERE id = ?",
        (counter_id, now_str, user["username"], req.ticket_id)
    )
    await db.execute("UPDATE counters SET current_ticket_id = ? WHERE id = ?", (req.ticket_id, counter_id))
    await db.commit()

    called_payload = {
        "id": ticket["id"],
        "queue_number": ticket["queue_number"],
        "queue_type": ticket["queue_type"],
        "counter_id": counter_id,
        "counter_name": counter["name"],
        "called_at": now_str
    }

    await ws_manager.broadcast_state("CALLED", last_called_ticket=called_payload)
    return {"message": "Skipped ticket called to counter", "ticket": called_payload}

@router.post("/{counter_id}/mark-no-show")
async def mark_no_show(
    counter_id: int,
    req: TicketActionBody,
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    await db.execute(
        "UPDATE tickets SET status = 'CANCELLED', completed_at = ?, notes = COALESCE(notes || ' ', '') || '[No Show]' WHERE id = ?",
        (now_str, req.ticket_id)
    )
    await db.commit()
    await ws_manager.broadcast_state("NO_SHOW", None)
    return {"message": "Ticket marked as No Show"}

@router.post("/{counter_id}/transfer")
async def transfer_ticket(
    counter_id: int,
    req: TransferRequest,
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    target_q = req.target_queue_type.upper()
    if target_q not in ["REGULAR", "PRIORITY", "COMPLAINT"]:
        raise HTTPException(status_code=400, detail="Invalid target queue type")

    note_suffix = f"[Transferred from Counter {counter_id}: {req.notes or ''}]".strip()

    # Move ticket back to WAITING under target queue type
    await db.execute(
        """
        UPDATE tickets 
        SET status = 'WAITING', queue_type = ?, counter_id = NULL, notes = COALESCE(notes || ' ', '') || ?
        WHERE id = ?
        """,
        (target_q, f" {note_suffix}", req.ticket_id)
    )

    # Clear origin counter if it was the active ticket
    await db.execute("UPDATE counters SET current_ticket_id = NULL WHERE id = ? AND current_ticket_id = ?", (counter_id, req.ticket_id))
    await db.commit()

    await ws_manager.broadcast_state("TRANSFERRED", None)
    return {"message": f"Ticket transferred to {target_q} queue"}


@router.post("/{counter_id}/status")
async def set_counter_status(
    counter_id: int,
    req: CounterStatusBody,
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Pause or resume a counter. While a counter in the R/P cover group is paused,
    its waiting customers are called by the other counter in that group.
    """
    new_status = req.status.upper()
    if new_status not in ("ACTIVE", "PAUSED"):
        raise HTTPException(status_code=400, detail="Status must be ACTIVE or PAUSED")

    cursor = await db.execute(
        "SELECT id, name, queue_type, status, current_ticket_id FROM counters WHERE id = ?",
        (counter_id,)
    )
    counter = await cursor.fetchone()
    if not counter:
        raise HTTPException(status_code=404, detail="Counter not found")

    if counter["queue_type"] not in COVER_GROUP:
        raise HTTPException(
            status_code=400,
            detail=f"{counter['name']} cannot be paused - no other counter covers the {counter['queue_type']} queue"
        )

    if new_status == "PAUSED":
        # Refuse to strand a customer who is already at the window
        if counter["current_ticket_id"]:
            cursor = await db.execute(
                "SELECT queue_number FROM tickets WHERE id = ? AND status IN ('CALLED', 'SERVING')",
                (counter["current_ticket_id"],)
            )
            active = await cursor.fetchone()
            if active:
                raise HTTPException(
                    status_code=409,
                    detail=f"Finish, skip or transfer {active['queue_number']} before pausing."
                )

        # Someone must be left to take the covered queue
        cursor = await db.execute(
            """
            SELECT COUNT(*) AS cnt FROM counters
            WHERE status = 'ACTIVE' AND id != ? AND queue_type IN (?, ?)
            """,
            (counter_id, COVER_GROUP[0], COVER_GROUP[1])
        )
        if (await cursor.fetchone())["cnt"] == 0:
            raise HTTPException(
                status_code=409,
                detail="Cannot pause - no other active counter is left to cover this queue."
            )

    await db.execute("UPDATE counters SET status = ? WHERE id = ?", (new_status, counter_id))
    await db.commit()

    await ws_manager.broadcast_state(
        "COUNTER_PAUSED" if new_status == "PAUSED" else "COUNTER_RESUMED",
        last_called_ticket=None
    )

    return {
        "message": f"{counter['name']} is now {new_status}",
        "counter_id": counter_id,
        "status": new_status
    }
