from fastapi import APIRouter, Depends, HTTPException, Query, Response
from datetime import datetime
from typing import Optional
import aiosqlite
import csv
import io

from database import get_db
from models import TicketGenerateRequest, ResetDailyRequest
from websocket_manager import ws_manager
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/tickets", tags=["Tickets"])

@router.post("/generate")
async def generate_ticket(
    req: TicketGenerateRequest,
    db: aiosqlite.Connection = Depends(get_db)
):
    q_type = req.queue_type.upper()
    if q_type not in ["REGULAR", "PRIORITY", "COMPLAINT"]:
        raise HTTPException(status_code=400, detail="Invalid queue type. Must be REGULAR, PRIORITY, or COMPLAINT")

    today = datetime.now().strftime("%Y-%m-%d")
    
    # 1. Lookup prefix from settings
    prefix_key = {
        "REGULAR": "regular_prefix",
        "PRIORITY": "priority_prefix",
        "COMPLAINT": "complaint_prefix"
    }[q_type]
    
    cursor = await db.execute("SELECT value FROM settings WHERE key = ?", (prefix_key,))
    row = await cursor.fetchone()
    prefix = row["value"] if row else q_type[0]

    # 2. Get next sequence number atomically
    cursor = await db.execute(
        "SELECT current_seq, session_date FROM queue_sequences WHERE queue_type = ?", 
        (q_type,)
    )
    seq_row = await cursor.fetchone()
    
    if not seq_row:
        next_seq = 1
        await db.execute(
            "INSERT INTO queue_sequences (queue_type, current_seq, session_date) VALUES (?, 1, ?)",
            (q_type, today)
        )
    else:
        # Check if the sequence date was from an older day and hasn't been reset yet
        if seq_row["session_date"] != today:
            next_seq = 1
        else:
            next_seq = seq_row["current_seq"] + 1
        
        await db.execute(
            "UPDATE queue_sequences SET current_seq = ?, session_date = ? WHERE queue_type = ?",
            (next_seq, today, q_type)
        )

    # 3. Format queue number e.g. R-001, P-008, C-012
    queue_number = f"{prefix}-{next_seq:03d}"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 4. Insert ticket
    cursor = await db.execute(
        """
        INSERT INTO tickets (
            queue_number, queue_type, session_date, number_seq, 
            status, created_at, notes
        ) VALUES (?, ?, ?, ?, 'WAITING', ?, ?)
        """,
        (queue_number, q_type, today, next_seq, now_str, req.notes)
    )
    ticket_id = cursor.lastrowid
    await db.commit()

    # 5. Fetch office name for ticket payload
    cursor = await db.execute("SELECT value FROM settings WHERE key = 'office_name'")
    office_row = await cursor.fetchone()
    office_name = office_row["value"] if office_row else "PANELCO III SOUTHEAST AREA OFFICE"

    ticket_data = {
        "id": ticket_id,
        "queue_number": queue_number,
        "queue_type": q_type,
        "session_date": today,
        "number_seq": next_seq,
        "status": "WAITING",
        "created_at": now_str,
        "office_name": office_name,
        "date_formatted": datetime.now().strftime("%d/%m/%Y"),
        "time_formatted": datetime.now().strftime("%I:%M %p")
    }

    # Broadcast state update to all connected screens
    await ws_manager.broadcast_state("TICKET_CREATED", last_called_ticket=None)

    return ticket_data

@router.post("/reset-daily")
async def reset_daily_queue(
    req: ResetDailyRequest,
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Guard/Admin triggered: Archives any lingering open tickets, resets sequences to 0.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 1. Close/archive active or waiting tickets
    await db.execute(
        """
        UPDATE tickets 
        SET status = 'CANCELLED', completed_at = ?, notes = COALESCE(notes || ' ', '') || '[Session Reset]'
        WHERE status IN ('WAITING', 'CALLED', 'SERVING')
        """,
        (now_str,)
    )

    # 2. Reset counters active ticket
    await db.execute("UPDATE counters SET current_ticket_id = NULL")

    # 3. Reset sequences to 0 for all queue types
    for q_type in ["REGULAR", "PRIORITY", "COMPLAINT"]:
        await db.execute(
            """
            INSERT INTO queue_sequences (queue_type, current_seq, session_date) 
            VALUES (?, 0, ?)
            ON CONFLICT(queue_type) DO UPDATE SET current_seq = 0, session_date = ?
            """,
            (q_type, today, today)
        )

    await db.commit()

    # Broadcast reset to all stations
    await ws_manager.broadcast_state("RESET_DAILY", last_called_ticket=None)

    return {"message": "Daily queue has been successfully reset", "session_date": today}

@router.get("/status")
async def get_queue_status():
    return await ws_manager.get_full_queue_snapshot(action="STATUS")

@router.get("/history")
async def get_ticket_history(
    date: Optional[str] = Query(None, description="YYYY-MM-DD date"),
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    target_date = date or datetime.now().strftime("%Y-%m-%d")
    cursor = await db.execute(
        """
        SELECT t.*, c.name as counter_name
        FROM tickets t
        LEFT JOIN counters c ON t.counter_id = c.id
        WHERE t.session_date = ?
        ORDER BY t.id DESC
        """,
        (target_date,)
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]

@router.get("/export-csv")
async def export_csv(
    date: Optional[str] = Query(None, description="YYYY-MM-DD date"),
    db: aiosqlite.Connection = Depends(get_db),
    user: dict = Depends(require_role("ADMIN"))
):
    target_date = date or datetime.now().strftime("%Y-%m-%d")
    cursor = await db.execute(
        """
        SELECT t.queue_number, t.queue_type, t.session_date, t.status, 
               t.created_at, t.called_at, t.serving_at, t.completed_at,
               c.name as counter_name, t.called_by_user, t.notes
        FROM tickets t
        LEFT JOIN counters c ON t.counter_id = c.id
        WHERE t.session_date = ?
        ORDER BY t.id ASC
        """,
        (target_date,)
    )
    rows = await cursor.fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Queue Number", "Queue Type", "Date", "Status", 
        "Created At", "Called At", "Serving At", "Completed At", 
        "Counter", "Served By", "Notes"
    ])

    for row in rows:
        writer.writerow([
            row["queue_number"],
            row["queue_type"],
            row["session_date"],
            row["status"],
            row["created_at"],
            row["called_at"] or "",
            row["serving_at"] or "",
            row["completed_at"] or "",
            row["counter_name"] or "",
            row["called_by_user"] or "",
            row["notes"] or ""
        ])

    csv_data = output.getvalue()
    filename = f"queue-records-{target_date}.csv"
    
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("/{ticket_id}/void")
async def void_ticket(
    ticket_id: int,
    db: aiosqlite.Connection = Depends(get_db)
):
    """
    Guard undo: voids a mis-tapped ticket that nobody has been called for yet.
    If it was the most recently issued number of its queue type today, the
    daily sequence is rolled back so the next customer does not skip a number.
    """
    cursor = await db.execute(
        "SELECT id, queue_number, queue_type, session_date, number_seq, status FROM tickets WHERE id = ?",
        (ticket_id,)
    )
    ticket = await cursor.fetchone()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if ticket["status"] != "WAITING":
        raise HTTPException(
            status_code=409,
            detail=f"Ticket {ticket['queue_number']} can no longer be voided (already {ticket['status'].lower()})"
        )

    today = datetime.now().strftime("%Y-%m-%d")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    await db.execute(
        """
        UPDATE tickets
        SET status = 'CANCELLED', completed_at = ?, notes = COALESCE(notes || ' ', '') || '[Voided by guard]'
        WHERE id = ? AND status = 'WAITING'
        """,
        (now_str, ticket_id)
    )

    # Roll the daily sequence back only if this was the last number issued for its type
    sequence_rolled_back = False
    if ticket["session_date"] == today:
        cursor = await db.execute(
            "SELECT current_seq FROM queue_sequences WHERE queue_type = ? AND session_date = ?",
            (ticket["queue_type"], today)
        )
        seq_row = await cursor.fetchone()
        if seq_row and seq_row["current_seq"] == ticket["number_seq"]:
            await db.execute(
                "UPDATE queue_sequences SET current_seq = ? WHERE queue_type = ?",
                (ticket["number_seq"] - 1, ticket["queue_type"])
            )
            sequence_rolled_back = True

    await db.commit()

    await ws_manager.broadcast_state("TICKET_VOIDED", last_called_ticket=None)

    return {
        "message": f"Ticket {ticket['queue_number']} voided",
        "queue_number": ticket["queue_number"],
        "sequence_rolled_back": sequence_rolled_back
    }
