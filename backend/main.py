import os
import socket
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import init_db
from websocket_manager import ws_manager
from routes import auth_routes, ticket_routes, counter_routes, admin_routes

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
    try:
        # Get all local IP addresses
        addr_infos = socket.getaddrinfo(hostname, None)
        for item in addr_infos:
            ip = item[4][0]
            if ":" not in ip and not ip.startswith("127."):
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

# Serve compiled Frontend SPA if dist folder exists
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    # Mount assets folder
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # SPA Catch-all route to serve index.html for all frontend paths
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Check if the requested file exists in dist
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        # Default to index.html for client-side routing
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Frontend build not found. Please build frontend first."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
