import aiosqlite
import os
import hashlib
import hmac
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "queue.db")

def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}${key.hex()}"

def verify_password(stored_hash: str, password: str) -> bool:
    try:
        salt, key_hex = stored_hash.split('$')
        new_key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
        return hmac.compare_digest(new_key.hex(), key_hex)
    except Exception:
        return False

async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
    finally:
        await db.close()

async def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode = WAL")
        await db.execute("PRAGMA foreign_keys = ON")
        
        # 1. Tickets table
        await db.execute("""
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            queue_number TEXT NOT NULL,
            queue_type TEXT NOT NULL, -- 'REGULAR', 'PRIORITY', 'COMPLAINT'
            session_date TEXT NOT NULL, -- 'YYYY-MM-DD'
            number_seq INTEGER NOT NULL,
            status TEXT NOT NULL, -- 'WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'SKIPPED', 'CANCELLED'
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            called_at TEXT,
            serving_at TEXT,
            completed_at TEXT,
            counter_id INTEGER,
            called_by_user TEXT,
            notes TEXT,
            FOREIGN KEY(counter_id) REFERENCES counters(id)
        )
        """)

        # Index for fast queue lookups
        await db.execute("CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, queue_type, session_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_tickets_session ON tickets(session_date)")

        # 2. Counters table
        await db.execute("""
        CREATE TABLE IF NOT EXISTS counters (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            queue_type TEXT NOT NULL, -- 'REGULAR', 'PRIORITY', 'COMPLAINT'
            status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'PAUSED', 'OFFLINE'
            current_ticket_id INTEGER,
            FOREIGN KEY(current_ticket_id) REFERENCES tickets(id)
        )
        """)

        # 3. Users table
        await db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL -- 'ADMIN', 'GUARD', 'COUNTER'
        )
        """)

        # 4. Settings table
        await db.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """)

        # 5. Daily sequence tracking table to support explicit manual guard resets
        await db.execute("""
        CREATE TABLE IF NOT EXISTS queue_sequences (
            queue_type TEXT PRIMARY KEY,
            current_seq INTEGER DEFAULT 0,
            session_date TEXT NOT NULL
        )
        """)

        # Seed default counters if not existing
        cursor = await db.execute("SELECT COUNT(*) FROM counters")
        row = await cursor.fetchone()
        if row[0] == 0:
            await db.execute("INSERT INTO counters (id, name, queue_type, status) VALUES (1, 'Counter 1', 'REGULAR', 'ACTIVE')")
            await db.execute("INSERT INTO counters (id, name, queue_type, status) VALUES (2, 'Counter 2', 'PRIORITY', 'ACTIVE')")
            await db.execute("INSERT INTO counters (id, name, queue_type, status) VALUES (3, 'Counter 3', 'COMPLAINT', 'ACTIVE')")

        # Seed default users
        cursor = await db.execute("SELECT COUNT(*) FROM users")
        row = await cursor.fetchone()
        if row[0] == 0:
            admin_pwd = hash_password("admin123")
            guard_pwd = hash_password("guard123")
            c1_pwd = hash_password("counter123")
            c2_pwd = hash_password("counter123")
            c3_pwd = hash_password("counter123")
            
            await db.execute("INSERT INTO users (username, password_hash, full_name, role) VALUES ('admin', ?, 'System Administrator', 'ADMIN')", (admin_pwd,))
            await db.execute("INSERT INTO users (username, password_hash, full_name, role) VALUES ('guard', ?, 'Security Guard', 'GUARD')", (guard_pwd,))
            await db.execute("INSERT INTO users (username, password_hash, full_name, role) VALUES ('counter1', ?, 'Counter 1 Operator', 'COUNTER')", (c1_pwd,))
            await db.execute("INSERT INTO users (username, password_hash, full_name, role) VALUES ('counter2', ?, 'Counter 2 Operator', 'COUNTER')", (c2_pwd,))
            await db.execute("INSERT INTO users (username, password_hash, full_name, role) VALUES ('counter3', ?, 'Counter 3 Operator', 'COUNTER')", (c3_pwd,))

        # Seed default settings
        default_settings = [
            ("office_name", "PANELCO III SOUTHEAST AREA OFFICE"),
            ("office_tagline", "Queue Management System"),
            ("regular_prefix", "R"),
            ("priority_prefix", "P"),
            ("complaint_prefix", "C"),
            ("sound_enabled", "true"),
            ("tts_voice_pitch", "1.0"),
            ("tts_voice_rate", "0.9"),
        ]
        for key, val in default_settings:
            await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))

        # Seed sequence table
        today = datetime.now().strftime("%Y-%m-%d")
        for q_type in ["REGULAR", "PRIORITY", "COMPLAINT"]:
            await db.execute("INSERT OR IGNORE INTO queue_sequences (queue_type, current_seq, session_date) VALUES (?, 0, ?)", (q_type, today))

        await db.commit()
