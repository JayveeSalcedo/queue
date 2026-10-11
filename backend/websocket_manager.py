import json
from datetime import datetime
from fastapi import WebSocket
from typing import List, Optional, Dict, Any
import aiosqlite
from database import DB_PATH

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        # Send current state snapshot immediately on connect
        snapshot = await self.get_full_queue_snapshot(action="INIT")
        await websocket.send_text(json.dumps(snapshot))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        message = json.dumps(data)
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        
        for conn in disconnected:
            self.disconnect(conn)

    async def broadcast_state(self, action: str, last_called_ticket: Optional[dict] = None):
        snapshot = await self.get_full_queue_snapshot(action=action, last_called_ticket=last_called_ticket)
        await self.broadcast(snapshot)

    async def get_full_queue_snapshot(self, action: Optional[str] = None, last_called_ticket: Optional[dict] = None) -> Dict[str, Any]:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            today = datetime.now().strftime("%Y-%m-%d")

            # 1. Fetch counters with their current active ticket
            cursor = await db.execute("""
                SELECT c.id, c.name, c.queue_type, c.status, c.current_ticket_id,
                       t.queue_number as ticket_number, t.queue_type as ticket_queue_type,
                       t.status as ticket_status, t.called_at, t.serving_at, t.called_by_user
                FROM counters c
                LEFT JOIN tickets t ON c.current_ticket_id = t.id
                ORDER BY c.id ASC
            """)
            counter_rows = await cursor.fetchall()
            counters = []
            for row in counter_rows:
                current_ticket = None
                if row["current_ticket_id"]:
                    current_ticket = {
                        "id": row["current_ticket_id"],
                        "queue_number": row["ticket_number"],
                        "queue_type": row["ticket_queue_type"],
                        "status": row["ticket_status"],
                        "called_at": row["called_at"],
                        "serving_at": row["serving_at"],
                        "called_by_user": row["called_by_user"]
                    }
                counters.append({
                    "id": row["id"],
                    "name": row["name"],
                    "queue_type": row["queue_type"],
                    "status": row["status"],
                    "current_ticket_id": row["current_ticket_id"],
                    "current_ticket": current_ticket
                })

            # 2. Waiting counts
            cursor = await db.execute("""
                SELECT queue_type, COUNT(*) as cnt 
                FROM tickets 
                WHERE status = 'WAITING' AND session_date = ?
                GROUP BY queue_type
            """, (today,))
            waiting_rows = await cursor.fetchall()
            waiting_counts = {"REGULAR": 0, "PRIORITY": 0, "COMPLAINT": 0, "TOTAL": 0}
            for row in waiting_rows:
                q = row["queue_type"]
                cnt = row["cnt"]
                if q in waiting_counts:
                    waiting_counts[q] = cnt
                waiting_counts["TOTAL"] += cnt

            # 2b. Waiting tickets list
            cursor = await db.execute("""
                SELECT id, queue_number, queue_type, session_date, number_seq, created_at, notes
                FROM tickets
                WHERE status = 'WAITING' AND session_date = ?
                ORDER BY number_seq ASC
            """, (today,))
            waiting_ticket_rows = await cursor.fetchall()
            waiting_tickets = [
                {
                    "id": r["id"],
                    "queue_number": r["queue_number"],
                    "queue_type": r["queue_type"],
                    "number_seq": r["number_seq"],
                    "created_at": r["created_at"],
                    "notes": r["notes"]
                }
                for r in waiting_ticket_rows
            ]

            # 3. Holding/Skipped tickets
            cursor = await db.execute("""
                SELECT t.id, t.queue_number, t.queue_type, t.called_at, t.counter_id, c.name as counter_name
                FROM tickets t
                LEFT JOIN counters c ON t.counter_id = c.id
                WHERE t.status = 'SKIPPED' AND t.session_date = ?
                ORDER BY t.called_at DESC
            """, (today,))
            skipped_rows = await cursor.fetchall()
            skipped_tickets = [
                {
                    "id": r["id"],
                    "queue_number": r["queue_number"],
                    "queue_type": r["queue_type"],
                    "called_at": r["called_at"],
                    "counter_id": r["counter_id"],
                    "counter_name": r["counter_name"]
                }
                for r in skipped_rows
            ]

            # 4. Recently served tickets (completed today)
            cursor = await db.execute("""
                SELECT t.id, t.queue_number, t.queue_type, t.completed_at, c.name as counter_name
                FROM tickets t
                LEFT JOIN counters c ON t.counter_id = c.id
                WHERE t.status = 'COMPLETED' AND t.session_date = ?
                ORDER BY t.completed_at DESC
                LIMIT 8
            """, (today,))
            recent_rows = await cursor.fetchall()
            recently_served = [
                {
                    "id": r["id"],
                    "queue_number": r["queue_number"],
                    "queue_type": r["queue_type"],
                    "completed_at": r["completed_at"],
                    "counter_name": r["counter_name"]
                }
                for r in recent_rows
            ]

            # 5. Fetch settings
            cursor = await db.execute("SELECT key, value FROM settings")
            setting_rows = await cursor.fetchall()
            settings = {r["key"]: r["value"] for r in setting_rows}

            return {
                "event": "QUEUE_STATE",
                "action": action or "UPDATE",
                "timestamp": datetime.now().isoformat(),
                "counters": counters,
                "waiting_counts": waiting_counts,
                "waiting_tickets": waiting_tickets,
                "skipped_tickets": skipped_tickets,
                "recently_served": recently_served,
                "last_called_ticket": last_called_ticket,
                "settings": settings
            }

ws_manager = ConnectionManager()
