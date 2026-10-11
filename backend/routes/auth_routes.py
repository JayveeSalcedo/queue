from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from database import get_db, verify_password, hash_password
from auth import create_access_token, get_current_user, require_role
from models import LoginRequest, TokenResponse, UserResponse
import aiosqlite

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class CreateUserRequest(BaseModel):
    username: str
    password: str
    full_name: str
    role: str # 'ADMIN', 'GUARD', 'COUNTER'

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("SELECT id, username, password_hash, full_name, role FROM users WHERE username = ?", (req.username,))
    user = await cursor.fetchone()
    if not user or not verify_password(user["password_hash"], req.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    token = create_access_token(data={"sub": user["username"], "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"]
        }
    }

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

@router.get("/users")
async def list_users(
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN"))
):
    cursor = await db.execute("SELECT id, username, full_name, role FROM users ORDER BY id ASC")
    rows = await cursor.fetchall()
    return [{"id": r["id"], "username": r["username"], "full_name": r["full_name"], "role": r["role"]} for r in rows]

@router.post("/users")
async def create_user(
    req: CreateUserRequest,
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN"))
):
    if req.role not in ["ADMIN", "GUARD", "COUNTER"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be ADMIN, GUARD, or COUNTER")
        
    pwd_hash = hash_password(req.password)
    try:
        cursor = await db.execute(
            "INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
            (req.username, pwd_hash, req.full_name, req.role)
        )
        await db.commit()
        return {"id": cursor.lastrowid, "username": req.username, "full_name": req.full_name, "role": req.role}
    except aiosqlite.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists")

@router.put("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    db: aiosqlite.Connection = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    cursor = await db.execute("SELECT password_hash FROM users WHERE id = ?", (current_user["id"],))
    row = await cursor.fetchone()
    if not row or not verify_password(row["password_hash"], req.current_password):
        raise HTTPException(status_code=400, detail="Current password incorrect")
        
    new_hash = hash_password(req.new_password)
    await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, current_user["id"]))
    await db.commit()
    return {"message": "Password updated successfully"}
