#!/bin/bash
# Queue Management System - Offline LAN Server (macOS / Linux)

cd "$(dirname "$0")" || exit 1

echo "======================================================================"
echo "         OFFICE QUEUE MANAGEMENT SYSTEM (OFFLINE LAN SERVER)"
echo "======================================================================"
echo

# 1. Check if backend venv exists
if [ ! -x "backend/venv/bin/python" ]; then
    echo "[INFO] Python virtual environment not found. Creating backend/venv..."
    python3 -m venv backend/venv || exit 1
    echo "[INFO] Installing backend dependencies..."
    backend/venv/bin/pip install -r backend/requirements.txt || exit 1
fi

# 2. Check if frontend dist exists
if [ ! -f "frontend/dist/index.html" ]; then
    echo "[INFO] Frontend production build not found. Building frontend..."
    (cd frontend && npm install && npm run build) || exit 1
fi

# List every network connection this PC has (LAN cable and Wi-Fi can each have their own address)
IP=""
ADDRESSES=""
while read -r DEV ADDR; do
    # Friendly name, e.g. "Wi-Fi" or "Ethernet" / "USB 10/100/1000 LAN"
    PORT=$(networksetup -listallhardwareports 2>/dev/null | awk -v d="$DEV" '/^Hardware Port:/{p=substr($0,16)} /^Device:/{if ($2==d) print p}')
    [ -z "$PORT" ] && PORT="$DEV"
    ADDRESSES="$ADDRESSES  $(printf '%-22s' "$PORT"): http://$ADDR:8000\n"
    [ -z "$IP" ] && IP="$ADDR"
done < <(ifconfig 2>/dev/null | awk '/^[a-z]/{dev=$1; sub(":","",dev)} /inet / && $2 !~ /^127\./ && $2 !~ /^169\.254\./ {print dev, $2}')
[ -z "$IP" ] && IP="localhost"

echo
echo "======================================================================"
echo " SERVER READY! CONNECT DEVICES ON THE OFFICE NETWORK (CABLE OR WI-FI):"
echo "======================================================================"
echo
echo "  This PC's address on each network connection:"
printf "%b" "$ADDRESSES"
echo
echo "  Other devices must use the address of the network they are on."
echo "  Station links below use $IP:"
echo
echo "  Guard Station Phone : http://$IP:8000/guard"
echo "  Counter 1 (Regular) : http://$IP:8000/counter/1"
echo "  Counter 2 (Priority): http://$IP:8000/counter/2"
echo "  Counter 3 (Request) : http://$IP:8000/counter/3"
echo "  Public Display (TV) : http://$IP:8000/display"
echo "  Admin Dashboard     : http://$IP:8000/admin"
echo "  Local PC Access     : http://localhost:8000"
echo
echo "======================================================================"
echo " Auto-reload is ON: backend code changes restart the server by themselves."
echo " Press Ctrl+C to stop the server at any time."
echo "======================================================================"
echo

# Open browser on local machine once the server has had a moment to start
(sleep 2 && open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null) &

# Start Uvicorn Server on 0.0.0.0:8000.
# --reload restarts the server by itself whenever a backend .py file changes, so new
# endpoints take effect without stopping it by hand (frontend changes need no restart).
exec backend/venv/bin/python -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload --reload-dir backend
