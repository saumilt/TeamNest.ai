"""Connector provider registry.

A static catalogue of supported connectors grouped by category. A provider is
`live` only when its OAuth credentials are present in the environment; the rest
are surfaced as "needs setup" so the framework is visible and each provider
plugs in the same way once its credentials are supplied.
"""
import os

# Default permission mode for every style-training connector: read-only.
DEFAULT_MODE = "read_only_style"

PERMISSION_MODES = [
    {"id": "no_access", "label": "No access"},
    {"id": "read_only_style", "label": "Read-only style analysis"},
    {"id": "read_only_knowledge", "label": "Read-only knowledge retrieval"},
    {"id": "draft_only", "label": "Draft-only"},
    {"id": "write_with_approval", "label": "Write with approval"},
]


def _live_gmail() -> bool:
    return bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"))


def _live_m365() -> bool:
    return bool(os.environ.get("M365_CLIENT_ID") and os.environ.get("M365_CLIENT_SECRET"))


# provider -> metadata. `oauth_start` is the backend path that kicks off OAuth.
PROVIDERS = [
    # Email
    {"provider": "gmail", "name": "Gmail", "category": "Email",
     "desc": "Learn your email communication style from your sent Gmail (read-only).",
     "scopes": ["gmail.readonly", "userinfo.email"], "oauth_start": "/api/oauth/gmail/login",
     "supports_style_training": True, "live": _live_gmail()},
    {"provider": "gworkspace", "name": "Google Workspace Gmail", "category": "Email",
     "desc": "Workspace Gmail style training (read-only).", "scopes": ["gmail.readonly"],
     "oauth_start": "/api/oauth/gmail/login", "supports_style_training": True, "live": _live_gmail()},
    {"provider": "outlook", "name": "Microsoft Outlook", "category": "Email",
     "desc": "Learn tone & follow-up patterns from Outlook mail (read-only).", "scopes": ["Mail.Read"],
     "oauth_start": "/api/oauth/m365/login", "supports_style_training": True, "live": _live_m365()},
    {"provider": "m365", "name": "Microsoft 365 Mail", "category": "Email",
     "desc": "Microsoft 365 / Exchange Online mail style training (read-only).", "scopes": ["Mail.Read"],
     "oauth_start": "/api/oauth/m365/login", "supports_style_training": True, "live": _live_m365()},
    # CRM
    {"provider": "hubspot", "name": "HubSpot", "category": "CRM",
     "desc": "Learn sales workflow style from CRM activities (sanitized).", "scopes": ["crm.objects.contacts.read"],
     "oauth_start": None, "supports_style_training": True, "live": False},
    {"provider": "salesforce", "name": "Salesforce", "category": "CRM",
     "desc": "Opportunity activity style patterns (sanitized).", "scopes": ["api"],
     "oauth_start": None, "supports_style_training": True, "live": False},
    # Chat
    {"provider": "slack", "name": "Slack", "category": "Chat",
     "desc": "Learn internal update style from selected channels.", "scopes": ["channels:history"],
     "oauth_start": None, "supports_style_training": True, "live": False},
    {"provider": "teams", "name": "Microsoft Teams", "category": "Chat",
     "desc": "Team messaging style (read-only).", "scopes": ["Chat.Read"],
     "oauth_start": None, "supports_style_training": True, "live": False},
    # Files
    {"provider": "gdrive", "name": "Google Drive", "category": "Files",
     "desc": "Reference documents for knowledge retrieval.", "scopes": ["drive.readonly"],
     "oauth_start": None, "supports_style_training": False, "live": False},
]


def public_registry() -> list:
    """Registry with secrets stripped — safe for the client."""
    return [
        {k: v for k, v in p.items()}
        for p in PROVIDERS
    ]


def get_provider(provider: str) -> dict | None:
    return next((p for p in PROVIDERS if p["provider"] == provider), None)
