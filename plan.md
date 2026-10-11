# Offline Web-Based Queue System Specification

## 1. Project Overview

A web-based, completely offline queue management system designed for an office or government service area.

The system runs entirely on the office's local area network (LAN), ensuring zero downtime even during total internet outages. 

The main server runs directly on an existing office Windows PC, while staff and visitors interact via web browsers on phones, tablets, PCs, and smart TVs / monitors.

### Core Principle
> **Internet is optional. Local network is required.**

### Visual Theme & Colorway
- **Primary Colorway**: **Green & Yellow** (Emerald/Forest Green `#0F5132` / `#16A34A` and Amber/Golden Yellow `#F59E0B` / `#FBBF24`).
- **Aesthetic**: Clean, modern, high-contrast, accessible government/office UI with clear status indicators and legible numbers on mobile and large displays.

---

## 2. System Architecture

```text
                               LOCAL NETWORK (LAN / Wi-Fi)
                                            │
                                  ┌─────────▼─────────┐
                                  │      ROUTER       │
                                  │   LAN  /  Wi-Fi   │
                                  └─────────┬─────────┘
                                            │
                                   Ethernet │
                                            │
                                  ┌─────────▼─────────┐
                                  │  OFFICE PC (WIN)  │
                                  │  FastAPI (Py 3.13)│
                                  │  SQLite (WAL)     │
                                  │  WebSocket Hub    │
                                  │  Static Frontend  │
                                  │  Port :8000       │
                                  └─────────┬─────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                  Wi-Fi                   Wi-Fi                   Wi-Fi / LAN
                    │                       │                       │
             ┌──────▼──────┐         ┌──────▼──────┐         ┌──────▼──────┐
             │ Guard Phone │         │ 3 Counters  │         │   Public    │
             │  (Browser)  │         │  (Browsers) │         │ Display TV  │
             └──────┬──────┘         └─────────────┘         └─────────────┘
                    │
            Bluetooth / Print
                    │
             ┌──────▼──────┐
             │ 58mm POS    │
             │ Thermal Ptr │
             └─────────────┘
```

---

## 3. Users, Stations & Responsibilities

### 3.1 Guard Station (`/guard`)
- **Device**: Android smartphone (or tablet) via web browser.
- **Access**: Role-based login (`GUARD` or `ADMIN`).
- **Ticket Generation**: **1-tap instantaneous buttons** for:
  - `Regular` (`R`)
  - `Priority` (`P` - Seniors, PWDs, Pregnant women)
  - `Request / Complaint` (`C`)
- **Daily Rollover**: Prominent **"Start New Day / Reset Numbers"** button with a confirmation modal that safely archives any lingering tickets and resets ticket numbers to `001`.
- **Printing**: Direct Web Bluetooth printing to 58mm ESC/POS thermal printer with standard browser print dialog (`window.print()` with 58mm CSS receipt) as zero-configuration fallback.

### 3.2 Counter Stations (`/counter` & `/counter/:id`)
- **Devices**: Desktop PCs, laptops, tablets, or smartphones.
- **Access**: Role-based login (`COUNTER` or `ADMIN`).
- **Counter Assignments**:
  - **Counter 1**: Dedicated to **Regular (`R`)** queue.
  - **Counter 2**: Dedicated to **Priority (`P`)** queue.
  - **Counter 3**: Dedicated to **Request / Complaint (`C`)** queue.
- **Workflow & Actions**:
  - `NEXT`: Calls the next waiting customer for the counter's assigned queue.
  - `RECALL`: Re-announces the current ticket on the Public Display.
  - `SKIP`: Moves the customer to a **Skipped / Holding** drawer (allowing staff to recall them if they return, or mark them as "No Show").
  - `COMPLETE`: Finishes serving the current customer and marks the ticket completed.
  - `TRANSFER`: Transfers a ticket to another counter/queue (e.g. Counter 1 transfers a complex case to Counter 3).

### 3.3 Public Display Screen (`/display`)
- **Device**: Smart TV, monitor, or PC browser in the waiting area.
- **Access**: Open public route (no login required).
- **Features**:
  - Large-screen optimized split-view cards for Counter 1, Counter 2, and Counter 3.
  - Bold ticket numbers with glowing animation on call / recall.
  - **Audio Alert**: Pleasant chime alert followed by offline **Web Speech API** voice synthesis (e.g. *"Now serving ticket R zero twenty-three, please proceed to Counter 1"*).
  - Ticker of recently served tickets and current waiting counts.
  - Real-time time, date, and office branding.

### 3.4 Admin Dashboard (`/admin`)
- **Access**: Role-based login (`ADMIN`).
- **Features**:
  - Real-time metrics: Today's tickets (Total, Served, Waiting, Skipped) and average wait / service duration per counter.
  - Counter status overview.
  - 1-click **CSV Export** of ticket records (ticket #, queue type, timestamps, wait duration, counter, operator, status).
  - Database management with manual and automated daily backup to `/backups/queue-YYYY-MM-DD.db`.
  - System configuration: Office name, prefixes, sound volume/toggles, user management.

---

## 4. Queue Types & Identifiers

| Service / Queue Type | Code / Prefix | Assigned Counter | Description |
| :--- | :--- | :--- | :--- |
| **Regular** | `R` (e.g. `R-001`) | **Counter 1** | Standard office transactions |
| **Priority** | `P` (e.g. `P-001`) | **Counter 2** | Senior Citizens, PWDs, Pregnant Women |
| **Request / Complaint** | `C` (e.g. `C-001`) | **Counter 3** | Inquiries, Requests, and Formal Complaints |

---

## 5. Thermal Printing Specification

- **Target Hardware**: Standard 58mm Bluetooth + USB ESC/POS thermal receipt printer.
- **Dual-Mode Implementation**:
  1. **Primary: Web Bluetooth API**  
     Connects directly from Android Chrome to the printer's Bluetooth GATT Serial service. Sends raw ESC/POS byte stream for instant receipt cutting/printing without print dialogs.
  2. **Fallback: Browser Print Dialog**  
     Uses `@media print` CSS formatted specifically for 58mm continuous roll paper. Works seamlessly with Android Print Spooler, RawBT, or USB drivers.
- **Receipt Layout**:
  ```text
  ================================
        [ OFFICE NAME ]
      OFFICE QUEUE SYSTEM
  --------------------------------
             R-023
         REGULAR QUEUE
  --------------------------------
   Please wait for your number.
   Date: 30/09/2026   Time: 03:42 PM
  ================================
  ```

---

## 6. Technology Stack

### 6.1 Backend & Server
- **Runtime**: Python 3.13
- **Framework**: **FastAPI** + **Uvicorn**
- **Concurrency**: Asynchronous WebSocket connection hub for instantaneous state broadcasts across all devices without polling.
- **Serving Architecture**: Monolithic single-port (`http://<server-ip>:8000`). Serves REST API, WebSocket streams (`/ws`), and static compiled frontend assets.
- **Database**: **SQLite** with Write-Ahead Logging (`WAL` mode) enabled for robust concurrent reads and writes.

### 6.2 Frontend
- **Framework**: **React 18 / 19** + **Vite** + **TypeScript**
- **Styling**: **Tailwind CSS** with custom **Green & Yellow** theme palette:
  - Deep Forest Green (`bg-emerald-900`, `text-emerald-50`)
  - Vibrant Emerald Green (`bg-emerald-600`, `hover:bg-emerald-700`)
  - Warm Amber / Golden Yellow (`bg-amber-500`, `text-amber-900`, `border-amber-400`)
  - Clean light neutral backgrounds with high-contrast text.
- **Icons**: Lucide React
- **Audio**: Web Audio API (procedural harmonic chime) + Web Speech API (offline TTS).
- **Navigation**: React Router (DOM) for SPA routing.
- **Deployment**: Standard responsive web view (no service worker / PWA caching to avoid stale offline asset desynchronization).

---

## 7. Data Models & Schemas

### 7.1 Tickets Table (`tickets`)
```sql
CREATE TABLE tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_number TEXT NOT NULL,          -- e.g. 'R-023'
    queue_type TEXT NOT NULL,            -- 'REGULAR', 'PRIORITY', 'COMPLAINT'
    session_date TEXT NOT NULL,          -- 'YYYY-MM-DD'
    number_seq INTEGER NOT NULL,         -- Sequence for the day (e.g. 23)
    status TEXT NOT NULL,                -- 'WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'SKIPPED', 'CANCELLED'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    called_at TIMESTAMP,
    serving_at TIMESTAMP,
    completed_at TIMESTAMP,
    counter_id INTEGER,
    called_by_user TEXT,
    notes TEXT,
    FOREIGN KEY(counter_id) REFERENCES counters(id)
);
```

### 7.2 Counters Table (`counters`)
```sql
CREATE TABLE counters (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,                  -- 'Counter 1', 'Counter 2', 'Counter 3'
    queue_type TEXT NOT NULL,            -- 'REGULAR', 'PRIORITY', 'COMPLAINT'
    status TEXT DEFAULT 'ACTIVE',        -- 'ACTIVE', 'PAUSED', 'OFFLINE'
    current_ticket_id INTEGER,
    FOREIGN KEY(current_ticket_id) REFERENCES tickets(id)
);
```

### 7.3 Users Table (`users`)
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL                   -- 'ADMIN', 'GUARD', 'COUNTER'
);
```

### 7.4 Settings Table (`settings`)
```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Default records:
-- ('office_name', 'OFFICE OF CITIZEN SERVICES')
-- ('regular_prefix', 'R')
-- ('priority_prefix', 'P')
-- ('complaint_prefix', 'C')
-- ('sound_enabled', 'true')
-- ('tts_voice_pitch', '1.0')
-- ('tts_voice_rate', '0.9')
```

---

## 8. Real-Time WebSocket Protocol

When any ticket action occurs (Ticket Created, Called, Recalled, Skipped, Completed, Transferred, or Queue Reset), the FastAPI server broadcasts an event payload to all connected clients:

```json
{
  "event": "QUEUE_STATE_CHANGED",
  "timestamp": "2026-09-30T22:20:00Z",
  "data": {
    "action": "CALLED",
    "ticket": {
      "id": 23,
      "queue_number": "R-023",
      "queue_type": "REGULAR",
      "counter_id": 1,
      "counter_name": "Counter 1"
    },
    "counters": [
      { "id": 1, "name": "Counter 1", "queue_type": "REGULAR", "current_ticket": "R-023", "status": "ACTIVE" },
      { "id": 2, "name": "Counter 2", "queue_type": "PRIORITY", "current_ticket": "P-008", "status": "ACTIVE" },
      { "id": 3, "name": "Counter 3", "queue_type": "COMPLAINT", "current_ticket": "C-005", "status": "ACTIVE" }
    ],
    "waiting_counts": {
      "REGULAR": 5,
      "PRIORITY": 1,
      "COMPLAINT": 2
    },
    "recently_served": ["R-022", "P-007", "R-021"]
  }
}
```

---

## 9. Server Startup & Windows Environment

1. **Launcher Script (`start_server.bat`)**:
   - Detects the local LAN IP address (e.g. `192.168.1.50`).
   - Ensures Python virtual environment and dependencies are ready.
   - Launches Uvicorn on `0.0.0.0:8000`.
   - Displays clear ASCII connection URLs for staff:
     - **Guard**: `http://192.168.1.50:8000/guard`
     - **Counter 1**: `http://192.168.1.50:8000/counter/1`
     - **Counter 2**: `http://192.168.1.50:8000/counter/2`
     - **Counter 3**: `http://192.168.1.50:8000/counter/3`
     - **Display**: `http://192.168.1.50:8000/display`
     - **Admin**: `http://192.168.1.50:8000/admin`
2. **Auto-Start**:
   - Shortcut to `start_server.bat` placed in Windows `shell:startup` folder for zero-touch boot startup.
