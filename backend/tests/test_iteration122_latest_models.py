"""Iteration 122 — latest AI model registry + chat-invite email regression.

Pure import-level assertions (no external LLM/Mailgun calls) so this stays a
fast, deterministic guard against silently regressing the model catalog or the
new premium tier.
"""
from ai_service import MODEL_CONFIG, _build_strengths_weaknesses
from services.billing import MODEL_CREDIT_COST, credit_cost_for_model
from routes.ai import PREMIUM_MODEL_KEYS
from services.ai_employee_dispatcher import PROVIDER_MAP


def test_premium_models_are_latest():
    assert MODEL_CONFIG["chatgpt"]["model"] == "gpt-5.6-sol"
    assert MODEL_CONFIG["chatgpt"]["display"] == "ChatGPT 5.6"
    assert MODEL_CONFIG["claude"]["model"] == "claude-sonnet-5"
    assert MODEL_CONFIG["claude"]["display"] == "Claude Sonnet 5"
    assert MODEL_CONFIG["gemini"]["model"] == "gemini-3.1-pro-preview"


def test_claude_opus_registered():
    assert "claude-opus" in MODEL_CONFIG
    opus = MODEL_CONFIG["claude-opus"]
    assert opus["model"] == "claude-opus-4-8"
    assert opus["provider"] == "anthropic"
    assert opus["engine"] == "emergent"
    # Strengths/weaknesses profile exists so the compare UI never shows blanks.
    sw = _build_strengths_weaknesses("claude-opus")
    assert sw["strengths"] and sw["weaknesses"]


def test_claude_opus_billing_and_gating():
    assert MODEL_CREDIT_COST["claude-opus"] == 45
    assert credit_cost_for_model("claude-opus") == 45
    # Opus is a premium (paid) model, not a free-fallback.
    assert "claude-opus" in PREMIUM_MODEL_KEYS


def test_employee_dispatcher_uses_latest_strings():
    assert PROVIDER_MAP["chatgpt"] == ("openai", "gpt-5.6-sol")
    assert PROVIDER_MAP["claude"] == ("anthropic", "claude-sonnet-5")
    assert PROVIDER_MAP["claude-opus"] == ("anthropic", "claude-opus-4-8")
    assert PROVIDER_MAP["gpt-4o-mini"] == ("openai", "gpt-5.4-mini")


def test_chat_invite_emails_new_accounts():
    """The chat-level invite endpoints must email brand-new invitees a
    set-password link (regression: they previously created an account with a
    one-time password but sent NO email)."""
    import inspect
    from routes import chats
    src = inspect.getsource(chats)
    assert "_email_new_invitee" in src
    # Both invite paths wire the helper into their response.
    assert src.count("await _email_new_invitee(target_user, current)") == 2
