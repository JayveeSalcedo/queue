"""
Order in which a counter that covers for a paused partner calls tickets.

Counters 1 (Regular) and 2 (Priority) cover each other while one is paused, and with the
"share while both are open" option they draw from both lines all the time. Whenever a counter
serves both queues there are two ways to order them:

  * Off (default): every waiting Priority ticket is called before any Regular one.
  * On  (load balancing): Priority, then up to N Regular tickets, then Priority again.
    Each queue is still strictly first come, first served inside itself, and when one
    queue runs out the other is simply called in order.
"""
from typing import List, Optional, Tuple

COVER_GROUP = ("REGULAR", "PRIORITY")

SETTING_ENABLED = "priority_balance_enabled"
SETTING_RATIO = "priority_balance_ratio"
SETTING_ALWAYS = "priority_balance_always"
DEFAULT_RATIO = 3
MAX_RATIO = 10


async def get_balance_config(db) -> Tuple[bool, int, bool]:
    """
    (enabled, regulars called between two priority tickets, share_always) from the settings
    table. share_always means Counter 1 and Counter 2 share both lines even while both are
    open; it only applies when load balancing itself is on.
    """
    cursor = await db.execute(
        "SELECT key, value FROM settings WHERE key IN (?, ?, ?)", (SETTING_ENABLED, SETTING_RATIO, SETTING_ALWAYS)
    )
    values = {r["key"]: r["value"] for r in await cursor.fetchall()}
    enabled = str(values.get(SETTING_ENABLED, "false")).lower() == "true"
    share_always = enabled and str(values.get(SETTING_ALWAYS, "false")).lower() == "true"
    try:
        ratio = int(values.get(SETTING_RATIO, DEFAULT_RATIO))
    except (TypeError, ValueError):
        ratio = DEFAULT_RATIO
    return enabled, max(1, min(MAX_RATIO, ratio)), share_always


async def regulars_since_priority(db, today: str) -> Optional[int]:
    """
    How many Regular tickets were called since the last Priority one today (across all
    counters). None when nothing has been called yet today. Kept in its own table, updated
    by note_call(), because called_at only has one-second resolution and cannot order
    calls made in the same second.
    """
    cursor = await db.execute("SELECT state_date, regulars_since FROM balance_state WHERE id = 1")
    row = await cursor.fetchone()
    if not row or row["state_date"] != today:
        return None
    return row["regulars_since"]


async def note_call(db, queue_type: str, today: str) -> None:
    """Record that a ticket was called. Does not commit; call it inside the calling transaction."""
    if queue_type not in COVER_GROUP:
        return
    current = await regulars_since_priority(db, today)
    new_value = 0 if queue_type == "PRIORITY" else (current or 0) + 1
    await db.execute(
        """
        INSERT INTO balance_state (id, state_date, regulars_since) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET state_date = excluded.state_date, regulars_since = excluded.regulars_since
        """,
        (today, new_value),
    )


def plan_call_order(
    priority: List,
    regular: List,
    enabled: bool,
    ratio: int,
    regulars_since: Optional[int],
    limit: Optional[int] = None,
) -> List:
    """
    Waiting tickets of both queues (each already in first come, first served order) in the
    order they will be called. `regulars_since` is the Regular count since the last
    Priority call; a Priority ticket is "due" once it reaches `ratio`.
    """
    if not enabled:
        order = list(priority) + list(regular)
        return order[:limit] if limit is not None else order

    since = ratio if regulars_since is None else regulars_since  # nothing called yet: Priority first
    p, r = list(priority), list(regular)
    order: List = []
    while (p or r) and (limit is None or len(order) < limit):
        take_priority = bool(p) and (not r or since >= ratio)
        if take_priority:
            order.append(p.pop(0))
            since = 0
        else:
            order.append(r.pop(0))
            since += 1
    return order
