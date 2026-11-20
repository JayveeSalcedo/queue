import mimetypes
import os
import socket
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import init_db
from paths import WEB_DIR, DOWNLOADS_DIR, MEDIA_DIR
from websocket_manager import ws_manager
from routes import auth_routes, ticket_routes, counter_routes, admin_routes, media_routes, announcement_routes

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize SQLite database, seed tables and settings
    await init_db()
    yield
    # Shutdown: Clean up if necessary

app = FastAPI(
    title="PANELCO III Southeast Area Office - Queue Management System",
    description="LAN-based offline queue system for PANELCO III Southeast Area Office",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local network and dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth_routes.router)
app.include_router(ticket_routes.router)
app.include_router(counter_routes.router)
app.include_router(admin_routes.router)
app.include_router(media_routes.router)
app.include_router(announcement_routes.router)

# WebSocket Endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection open; clients can optionally send ping or station pings
            data = await websocket.receive_text()
            # If client sends a ping or action
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

# LAN Network Info helper
@app.get("/api/network-info")
async def get_network_info():
    hostname = socket.gethostname()
    ip_addresses = []

    # The address on the connection that has the router (default route) goes first.
    # No packet is sent; this only asks the OS which interface it would use.
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        routed_ip = s.getsockname()[0]
        s.close()
        if not routed_ip.startswith("127."):
            ip_addresses.append(routed_ip)
    except Exception:
        pass

    try:
        # Get all local IP addresses
        addr_infos = socket.getaddrinfo(hostname, None)
        for item in addr_infos:
            ip = item[4][0]
            if ":" not in ip and not ip.startswith("127.") and not ip.startswith("169.254."):
                if ip not in ip_addresses:
                    ip_addresses.append(ip)
    except Exception:
        pass
    
    # Fallback method using connect trick
    if not ip_addresses:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            fallback_ip = s.getsockname()[0]
            s.close()
            ip_addresses.append(fallback_ip)
        except Exception:
            ip_addresses.append("127.0.0.1")

    return {
        "hostname": hostname,
        "primary_ip": ip_addresses[0] if ip_addresses else "127.0.0.1",
        "ip_addresses": ip_addresses,
        "port": 8000
    }

# Files counter PCs download to set themselves up (the always-on-top mini window app).
# Only plain file names inside the downloads folder are served, nothing else.
@app.get("/downloads/{file_name}")
async def download_station_file(file_name: str):
    if os.path.basename(file_name) != file_name or not file_name.lower().endswith(".exe"):
        raise HTTPException(status_code=404, detail="Not found")
    path = os.path.join(DOWNLOADS_DIR, file_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type="application/octet-stream", filename=file_name)

# Infomercial videos for the TV display. Only plain file names inside the media folder
# are served. FileResponse handles Range requests, which Safari needs to play video.
@app.get("/media/{file_name}")
async def serve_media(file_name: str):
    if os.path.basename(file_name) != file_name:
        raise HTTPException(status_code=404, detail="Not found")
    path = os.path.join(MEDIA_DIR, file_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type=mimetypes.guess_type(file_name)[0] or "application/octet-stream")

# Serve compiled Frontend SPA if dist folder exists
FRONTEND_DIST = WEB_DIR

if os.path.exists(FRONTEND_DIST):
    # Mount assets folder
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # SPA Catch-all route to serve index.html for all frontend paths
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Serve the file only if it really is inside the web folder. Resolving the
        # path first stops "..%2f..%2f" tricks from reading other files on the PC.
        web_root = os.path.realpath(FRONTEND_DIST)
        file_path = os.path.realpath(os.path.join(web_root, full_path))
        if full_path and file_path.startswith(web_root + os.sep) and os.path.isfile(file_path):
            return FileResponse(file_path)
        # Default to index.html for client-side routing
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Frontend build not found. Please build frontend first."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
