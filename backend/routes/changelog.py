"""In-app changelog — "What's new" modal that auto-shows once per user when the
hardcoded `CHANGELOG_VERSION` changes. User-level `last_seen_changelog_version`
is stored on the `users` doc.

To ship a new entry: bump `CHANGELOG_VERSION` AND prepend a new dict to
`CHANGELOG_ENTRIES`. Everyone who hasn't seen this version will be auto-shown
the modal on their next page load.
"""
from typing import Optional

from fastapi import APIRouter, Depends

from deps import db, now_iso, require_user

router = APIRouter()

# Bump this string every time you want to re-pop the modal to all users.
CHANGELOG_VERSION = "2026-02-28"

CHANGELOG_ENTRIES = [
    {
        "title": "What's new",
        "tagline": "Big shipping week — your workspace just got smarter.",
        "highlights": [
            {
                "icon": "brain",
                "title": "Persistent project memory",
                "body": "Every chat, project, and approved decision is now part of your team's AI memory. Ask the AI a follow-up question and it answers using prior research, calls, and decisions — with citations.",
                "link": "/memory",
                "link_label": "Explore Memory",
            },
            {
                "icon": "gavel",
                "title": "Decision log + auto-capture",
                "body": "Every approved AI answer auto-creates a Decision Log row with status workflow (proposed → approved → reversed/superseded) and full history.",
                "link": "/decisions",
                "link_label": "View Decisions",
            },
            {
                "icon": "message",
                "title": "WhatsApp import",
                "body": "Bring your team's old WhatsApp history into TeamNest. Map participants → pick a chat → done. Imported messages auto-feed memory.",
                "link": "/import/whatsapp",
                "link_label": "Import a chat",
            },
            {
                "icon": "clock",
                "title": "Project memory timeline",
                "body": "A chronological story of each project: decisions, risks, research, calls. Perfect for status syncs and onboarding teammates.",
                "link": "/projects",
                "link_label": "Open Projects",
            },
            {
                "icon": "bell",
                "title": "Notification preferences",
                "body": "Mute by chat, mute by type, set Do Not Disturb hours, choose daily or weekly email digest.",
                "link": "/notifications",
                "link_label": "Set preferences",
            },
            {
                "icon": "shield",
                "title": "Audit log + memory access rules",
                "body": "Admins can now see every role change, approval, import, and decision in the audit log — and limit which roles can use chat / project / workspace memory.",
                "link": "/audit-log",
                "link_label": "View audit log",
            },
        ],
    },
]


@router.get("/changelog")
async def get_changelog(current=Depends(require_user)):
    """Return changelog + whether the current user has seen this version."""
    last_seen: Optional[str] = current.get("last_seen_changelog_version")
    unseen = last_seen != CHANGELOG_VERSION
    return {
        "version": CHANGELOG_VERSION,
        "entries": CHANGELOG_ENTRIES,
        "unseen": unseen,
        "last_seen_version": last_seen,
    }


@router.post("/changelog/seen")
async def mark_seen(current=Depends(require_user)):
    """Mark the current changelog version as seen by this user."""
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {
            "last_seen_changelog_version": CHANGELOG_VERSION,
            "last_seen_changelog_at": now_iso(),
        }},
    )
    return {"ok": True, "version": CHANGELOG_VERSION}
