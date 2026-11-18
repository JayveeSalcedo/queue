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

## 🚀 Setup (plug and play)

### 1. Server PC: run `QueueSetup.exe` once
Double-click **`QueueSetup.exe`**, click *Next*, and approve the administrator prompt. That's all. It needs no Python, no Node and no internet. The installer:
- installs the server and the web pages,
- opens the network port (replaces `allow_firewall.bat`),
- makes the server **start by itself when Windows starts**, even before anyone logs in, and restart itself if it ever stops,
- puts a **Queue System** icon on the Desktop.

Your data (database, backups, logs) lives in `C:\ProgramData\QueueSystem` and is **kept** when you upgrade or uninstall. To upgrade, just run a newer `QueueSetup.exe`.
Start Menu → *Queue System* has **Restart queue server**, **Server log** and **Database backups**.

> Windows may show a blue "protected your PC" box for an unsigned installer: click **More info → Run anyway**.

### 2. Counter PCs: one click from the browser
On each counter PC open the server address, sign in with the counter account, click **Install** in the top bar → **Download Windows shortcuts**, and open the downloaded file. It puts two icons on the Desktop:
- **Counter N**: the full counter page in its own window.
- **Counter N - Mini**: a small window (Next / Recall / Skip / Complete / Pause) that **stays on top of all other programs**. It can also start automatically with Windows.

The mini app is downloaded from the server itself, so there is nothing to carry around on a USB stick.

### 3. Guard phone
Open the server address in **Chrome** (Android) or **Safari** (iPhone), tap **Install** in the top bar and follow the 3 steps. The icon opens straight to the guard screen.

### Building `QueueSetup.exe`
Windows programs can't be built on a Mac. Either:
- **GitHub builds it for you:** *Actions → Windows installer → Run workflow* (or push a tag like `v1.0.0` to also publish a Release). Download `QueueSetup` from the run's artifacts.
- **Or on a Windows PC** with Python 3.11+, Node.js 20+ and [Inno Setup 6](https://jrsoftware.org/isdl.php): run `windows\build.bat`. The result is `windows\output\QueueSetup.exe`.

### For developers (no installer)
1. Double-click **`install_requirements.bat`** (needs internet once), then right-click **`allow_firewall.bat`** → *Run as administrator*.
2. Double-click **`start_server.bat`**. It detects the LAN address, starts the server and opens the Home portal.

---

## 📱 Station URLs & Station Accounts

All devices on the same office network can access the system, whether they connect with a LAN cable or over Wi-Fi. If the server PC has both a cable and Wi-Fi, it has a separate address on each; `start_server` lists them all, and each device should use the address of the network it is on:

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
