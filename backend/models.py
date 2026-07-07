"""Pydantic models for Emergent AI Teams."""
from datetime import datetime, timezone
from typing import List, Optional, Literal
import uuid

from pydantic import BaseModel, EmailStr


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ====== USERS ======
class UserSignup(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    name: str
    email: str
    avatar: Optional[str] = None
    role: str = "member"
    workspace_id: Optional[str] = None
    status: str = "active"
    created_at: str


# ====== WORKSPACE ======
class WorkspaceCreate(BaseModel):
    name: str


class InviteMember(BaseModel):
    name: str
    email: EmailStr
    role: Literal["owner", "admin", "member", "viewer"] = "member"


class WorkspaceSwitch(BaseModel):
    workspace_id: str


class WorkspaceTransferOwnership(BaseModel):
    new_owner_id: str


class GuestRemove(BaseModel):
    chat_id: str
    user_id: str


# ====== CHATS ======
class ChatCreate(BaseModel):
    type: Literal["direct", "group", "personal_ai"]
    name: Optional[str] = None
    description: Optional[str] = None
    member_ids: List[str] = []
    project_folder_id: Optional[str] = None
    default_models: List[str] = []
    # Group chat posting policy
    posting_policy: Optional[Literal["all", "admin_only", "selected"]] = "all"
    posting_user_ids: Optional[List[str]] = None  # required when posting_policy == "selected"


class ChatMembersAdd(BaseModel):
    user_ids: List[str]


class ChatPostingPolicy(BaseModel):
    posting_policy: Literal["all", "admin_only", "selected"]
    posting_user_ids: Optional[List[str]] = None


class ChatAdminToggle(BaseModel):
    user_id: str
    make_admin: bool  # True = promote, False = demote


class ChatViewerToggle(BaseModel):
    """Dedicated model for the viewer-role toggle so the API surface no longer
    overloads `make_admin` to also mean 'make viewer'."""
    user_id: str
    make_viewer: bool  # True = mark as viewer (read-only), False = restore full member


# ====== MESSAGES ======
class MessageCreate(BaseModel):
    body: str
    message_type: Literal["text", "ai_question", "ai_answer", "task", "file", "system"] = "text"
    parent_message_id: Optional[str] = None
    metadata: dict = {}


class MessageEdit(BaseModel):
    body: str


class MessageReact(BaseModel):
    emoji: str


# ====== AI ======
class AIResearchCreate(BaseModel):
    chat_id: str
    question: str
    selected_models: List[str]
    # Phase 4 — memory / RAG controls
    memory_mode: Optional[Literal["none", "chat", "project", "workspace", "custom"]] = "chat"
    selected_memory_ids: Optional[List[str]] = None  # only when memory_mode == "custom"
    # Vision — file IDs of uploaded images to include in the question
    image_file_ids: Optional[List[str]] = None


class AIThreadContinue(BaseModel):
    """Continue an existing AI research thread with a follow-up question.
    Reuses the thread's chat scope and selected_models by default."""
    question: str
    added_context: Optional[str] = None
    selected_models: Optional[List[str]] = None
    memory_mode: Optional[Literal["none", "chat", "project", "workspace", "custom"]] = "chat"


class AIThreadBranch(BaseModel):
    """Fork an AI thread into a new scenario branch."""
    branch_name: str
    scenario_description: str
    selected_models: Optional[List[str]] = None


# ====== Phase 4 — Memory / RAG ======
class MemorySave(BaseModel):
    """Manually pin a source (message, ai answer, file) as a memory item."""
    source_type: Literal[
        "message", "ai_response", "ai_thread", "task", "file",
        "call_summary", "transcript", "approval", "voice_note",
    ]
    source_id: str
    chat_id: Optional[str] = None
    project_folder_id: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    memory_type: Literal["fact", "decision", "assumption", "risk", "task", "research", "note"] = "note"
    visibility: Literal["private", "chat", "project", "workspace"] = "chat"


class MemoryUpdate(BaseModel):
    status: Optional[Literal["active", "outdated", "archived", "deleted"]] = None
    memory_type: Optional[Literal["fact", "decision", "assumption", "risk", "task", "research", "note"]] = None
    title: Optional[str] = None
    content: Optional[str] = None
    visibility: Optional[Literal["private", "chat", "project", "workspace"]] = None


class MemoryAccessRule(BaseModel):
    role: Literal["owner", "admin", "member", "viewer", "guest"]
    can_use_chat_memory: bool = True
    can_use_project_memory: bool = True
    can_use_workspace_memory: bool = True
    can_delete_memory: bool = False
    can_archive_memory: bool = True
    can_export_memory: bool = True


class AIVote(BaseModel):
    vote_category: Literal["best", "most_accurate", "best_citations", "most_useful"]


class AIImproveRequest(BaseModel):
    text: str
    action: Literal[
        "fix_grammar",
        "make_professional",
        "make_shorter",
        "make_detailed",
        "make_persuasive",
        "make_diplomatic",
        "bullet_points",
        "translate",
        "fact_check",
        "improve_tone",
    ] = "improve_tone"
    target_language: Optional[str] = "English"


class AIExtractTaskRequest(BaseModel):
    message_body: str
    message_id: Optional[str] = None
    chat_id: Optional[str] = None


class AISuggestTasksRequest(BaseModel):
    """Ask AI to break a message into 1..N actionable tasks."""
    message_body: str
    message_id: Optional[str] = None
    chat_id: Optional[str] = None
    max_tasks: int = 5


class UserPreferences(BaseModel):
    favorite_ai_model: Optional[str] = None  # e.g. "claude"
    favorite_models: List[str] = []  # quick-toggle palette (optional)


# ====== FOLDERS ======
class FolderCreate(BaseModel):
    name: str
    description: Optional[str] = None
    member_ids: List[str] = []


class SaveResearch(BaseModel):
    research_thread_id: str
    title: str
    final_answer: str


# ====== TASKS ======
class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    status: Literal["todo", "in_progress", "needs_review", "completed", "overdue"] = "todo"
    project_folder_id: Optional[str] = None
    source_chat_id: Optional[str] = None
    source_message_id: Optional[str] = None
    # When created by an AI employee (e.g. AI CMO drafted this campaign plan),
    # the dispatcher passes its key here so we can credit hours/dollars saved.
    created_by_employee_key: Optional[str] = None
    estimated_hours_saved: Optional[float] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    project_folder_id: Optional[str] = None


# ====== INTEGRATIONS ======
class IntegrationCreate(BaseModel):
    type: Literal["incoming_webhook", "outgoing_webhook", "api_fetch"]
    name: str
    config: dict = {}  # outgoing_webhook: {url}, api_fetch: {url, method, headers}


class ApiFetchRequest(BaseModel):
    url: str
    method: Literal["GET", "POST"] = "GET"
    headers: dict = {}
    body: Optional[str] = None
    label: Optional[str] = None


class WebhookPayload(BaseModel):
    text: Optional[str] = None
    title: Optional[str] = None
    source: Optional[str] = None
    data: Optional[dict] = None


# ====== INVITES (Find Your Friends) ======
class InviteLinkRotate(BaseModel):
    role: Literal["owner", "admin", "member", "viewer"] = "member"
    max_uses: Optional[int] = None  # null = unlimited
    expires_in_days: Optional[int] = 30  # null = never


class InviteBulkRequest(BaseModel):
    emails: List[EmailStr]
    note: Optional[str] = None
    share_url_base: Optional[str] = None  # e.g. "https://teamnest.ai" — passed by client so mailto uses correct env


class InviteRedeem(BaseModel):
    token: str
    name: Optional[str] = None  # required only for new accounts
    email: EmailStr
    password: str
    phone: Optional[str] = None


class AddExistingMember(BaseModel):
    user_id: str
    role: Literal["owner", "admin", "member", "viewer"] = "member"


class InviteGuestToChat(BaseModel):
    user_id: Optional[str] = None  # existing TeamNest user
    name: Optional[str] = None
    email: Optional[EmailStr] = None  # for brand-new email invite
    phone: Optional[str] = None


# ====== APPROVALS ======
class ApprovalCreate(BaseModel):
    research_thread_id: str
    title: str
    final_answer: str
    reviewer_ids: List[str] = []
    project_folder_id: Optional[str] = None


class ApprovalDecision(BaseModel):
    status: Literal["approved", "rejected", "needs_revision"]
    comment: Optional[str] = None


class ApprovalEdit(BaseModel):
    title: Optional[str] = None
    final_answer: Optional[str] = None
    reviewer_ids: Optional[List[str]] = None


# ====== VOICE NOTES ======
class VoiceNoteAction(BaseModel):
    action: Literal["transcribe", "summarize", "create_task", "save_to_folder"]
    folder_id: Optional[str] = None  # for save_to_folder
    assignee_id: Optional[str] = None  # for create_task


# ====== CALLS (LiveKit) ======
class CallStart(BaseModel):
    chat_id: str
    mode: Literal["audio", "video"] = "audio"


class CallJoin(BaseModel):
    call_id: str


class CallEnd(BaseModel):
    duration_seconds: Optional[float] = None


class CallSummaryRequest(BaseModel):
    regenerate: bool = False
    extra_context: Optional[str] = None


class CallTranscriptEdit(BaseModel):
    transcript_text: str


class CallTranscribeChunk(BaseModel):
    """Inline metadata for a streaming transcript chunk (audio sent as multipart form)."""
    seq: int = 0
    started_at: Optional[str] = None  # client-side timestamp


class CallHighlightsRequest(BaseModel):
    regenerate: bool = False
