from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from database import get_db, verify_password, hash_password
from auth import create_access_token, get_current_user, require_role
from models import LoginRequest, TokenResponse, UserResponse
import re
import aiosqlite

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class CreateUserRequest(BaseModel):
    username: str
    password: str
    full_name: str
    role: str # 'ADMIN', 'GUARD', 'COUNTER'
    counter_id: Optional[int] = None  # which counter a COUNTER account operates

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class UpdateAccountRequest(BaseModel):
    current_password: str
    new_username: Optional[str] = None
    new_password: Optional[str] = None

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]{3,32}$")
MIN_PASSWORD_LENGTH = 6

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("SELECT id, username, password_hash, full_name, role, counter_id FROM users WHERE username = ?", (req.username,))
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
            "role": user["role"],
            "counter_id": user["counter_id"]
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
            "INSERT INTO users (username, password_hash, full_name, role, counter_id) VALUES (?, ?, ?, ?, ?)",
            (req.username, pwd_hash, req.full_name, req.role, req.counter_id if req.role == "COUNTER" else None)
        )
        await db.commit()
        return {"id": cursor.lastrowid, "username": req.username, "full_name": req.full_name, "role": req.role, "counter_id": req.counter_id}
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


@router.put("/account", response_model=TokenResponse)
async def update_account(
    req: UpdateAccountRequest,
    db: aiosqlite.Connection = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN"))
):
    """
    Lets the signed-in admin change their own username and/or password. The current
    password is always required. Sign-in tokens carry the username, so a fresh token
    is returned and the admin stays signed in on this screen.
    """
    new_username = (req.new_username or "").strip()
    new_password = req.new_password or ""
    if not new_username and not new_password:
        raise HTTPException(status_code=400, detail="Enter a new username or a new password.")

    cursor = await db.execute("SELECT password_hash FROM users WHERE id = ?", (admin["id"],))
    row = await cursor.fetchone()
    if not row or not verify_password(row["password_hash"], req.current_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    if new_username and new_username == admin["username"]:
        new_username = ""  # nothing to change
    if new_username:
        if not USERNAME_PATTERN.match(new_username):
            raise HTTPException(
                status_code=400,
                detail="Username must be 3-32 characters: letters, numbers, dot, dash or underscore."
            )
        cursor = await db.execute(
            "SELECT 1 FROM users WHERE lower(username) = lower(?) AND id != ?", (new_username, admin["id"])
        )
        if await cursor.fetchone():
            raise HTTPException(status_code=400, detail="That username is already taken.")
    if new_password:
        if len(new_password) < MIN_PASSWORD_LENGTH:
            raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
        if verify_password(row["password_hash"], new_password):
            raise HTTPException(status_code=400, detail="The new password is the same as the current one.")
    if not new_username and not new_password:
        raise HTTPException(status_code=400, detail="Nothing to change.")

    username = new_username or admin["username"]
    if new_username:
        await db.execute("UPDATE users SET username = ? WHERE id = ?", (new_username, admin["id"]))
    if new_password:
        await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new_password), admin["id"]))
    await db.commit()

    return {
        "access_token": create_access_token(data={"sub": username, "role": admin["role"]}),
        "token_type": "bearer",
        "user": {**admin, "username": username},
    }
