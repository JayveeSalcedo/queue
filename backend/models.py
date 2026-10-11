from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class LoginRequest(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TicketGenerateRequest(BaseModel):
    queue_type: str = Field(..., description="'REGULAR', 'PRIORITY', or 'COMPLAINT'")
    notes: Optional[str] = None

class TicketResponse(BaseModel):
    id: int
    queue_number: str
    queue_type: str
    session_date: str
    number_seq: int
    status: str
    created_at: str
    called_at: Optional[str] = None
    serving_at: Optional[str] = None
    completed_at: Optional[str] = None
    counter_id: Optional[int] = None
    counter_name: Optional[str] = None
    called_by_user: Optional[str] = None
    notes: Optional[str] = None

class CounterResponse(BaseModel):
    id: int
    name: str
    queue_type: str
    status: str
    current_ticket_id: Optional[int] = None
    current_ticket: Optional[TicketResponse] = None

class TransferRequest(BaseModel):
    ticket_id: int
    target_queue_type: str
    target_counter_id: Optional[int] = None
    notes: Optional[str] = None

class ResetDailyRequest(BaseModel):
    confirmed: bool = True

class SettingsUpdate(BaseModel):
    settings: Dict[str, str]

class QueueStateSnapshot(BaseModel):
    counters: List[CounterResponse]
    waiting_counts: Dict[str, int]
    recently_served: List[TicketResponse]
    current_serving: List[TicketResponse]
    last_called_ticket: Optional[TicketResponse] = None
    action: Optional[str] = None
    timestamp: str
