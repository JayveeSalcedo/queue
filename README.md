# Offline Web-Based Queue Management System

A web-based, completely offline queue system designed for office and government service areas.

Runs on the local area network (LAN). **Internet is optional. Local network is required.**

---

## 🎨 Theme & Colorway
Designed with a **Green & Yellow** colorway:
- **Primary**: Deep Forest & Vibrant Emerald Green (`#065f46` / `#047857`)
- **Accent**: Warm Amber & Golden Yellow (`#f59e0b` / `#fbbf24`)
- High-contrast, legible typography optimized for phones, desktop counters, and large waiting-room TVs.

---

## 🚀 Quick Start (Office PC Server)

To start the queue server on Windows:

1. Double-click **`start_server.bat`** in this directory.
2. The script will automatically:
   - Verify Python and frontend builds.
   - Detect the local LAN IP address (e.g. `http://192.168.1.51:8000`).
   - Launch the FastAPI server.
   - Open your browser to the Home portal.

---

## 📱 Station URLs & Station Accounts

All devices connected to the same router or Wi-Fi can access the system:

| Station | URL | Access / Default Account | Description |
| :--- | :--- | :--- | :--- |
| **Home Portal** | `http://<SERVER-IP>:8000/` | Open | Directory showing all station URLs and live queue summary |
| **Guard Station** | `http://<SERVER-IP>:8000/guard` | `guard` / `guard123` | 1-tap ticket creation & 58mm Bluetooth receipt printing |
| **Counter 1** | `http://<SERVER-IP>:8000/counter/1` | `counter1` / `counter123` | Dedicated calling station for **Regular Queue (R)** |
| **Counter 2** | `http://<SERVER-IP>:8000/counter/2` | `counter2` / `counter123` | Dedicated station for **Priority Queue (P)** (PWD, Senior, Pregnant) |
| **Counter 3** | `http://<SERVER-IP>:8000/counter/3` | `counter3` / `counter123` | Dedicated station for **Request / Complaint Queue (C)** |
| **Public Display** | `http://<SERVER-IP>:8000/display` | **Open (No Login Required)** | TV display with flashing ticket cards, chime & voice speech |
| **Admin Panel** | `http://<SERVER-IP>:8000/admin` | `admin` / `admin123` | Metrics, CSV export, daily SQLite backups & settings |

---

## 🖨️ 58mm Thermal Printer Support

Designed for standard 58mm Bluetooth + USB ESC/POS thermal printers:
1. **Primary: Web Bluetooth**  
   Tap **"Pair 58mm Printer"** on Chrome for Android on the Guard's phone. Prints directly via ESC/POS without print dialogs.
2. **Fallback: Browser Print Dialog**  
   Standard browser print dialog pre-formatted for 58mm continuous roll paper.

---

## 🔄 Daily Rollover / Queue Reset
- Queue numbers are manually reset by the Guard or Admin.
- The Guard screen features a prominent **"Start New Day / Reset Numbers"** button protected by a confirmation modal.
- Resetting safely archives active tickets and restarts numbering at `001` (e.g., `R-001`, `P-001`, `C-001`).

---

## 🔊 Public Display Audio
- Procedural **Web Audio API** chime (plays a pleasant harmonic chime with zero audio file downloads).
- Offline **Web Speech API** voice synthesis (*"Now serving ticket R-023, please proceed to Counter 1"*).
- Re-announced whenever counter staff clicks **RECALL**.

---

## ⚙️ Windows Boot Autostart

To make the server start automatically when the Office PC boots:
1. Press `Win + R`, type `shell:startup`, and press Enter.
2. Create a shortcut to `start_server.bat` inside that folder.
