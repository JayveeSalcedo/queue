import jwt
from datetime import datetime, timedelta
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from database import get_db

SECRET_KEY = "offline-queue-system-super-secret-key-lan-only"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days for office LAN sessions

security = HTTPBearer(auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except Exception:
        return None

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
        
    username = payload["sub"]
    async for db in get_db():
        cursor = await db.execute("SELECT id, username, full_name, role FROM users WHERE username = ?", (username,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="User not found")
        return {
            "id": row["id"],
            "username": row["username"],
            "full_name": row["full_name"],
            "role": row["role"]
        }
    raise HTTPException(status_code=500, detail="Database error")

def require_role(*roles: str):
    async def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles and "ADMIN" not in roles and user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail=f"Permission denied: requires one of {roles}")
        return user
    return role_checker
