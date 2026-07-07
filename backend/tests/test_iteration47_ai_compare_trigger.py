"""Iteration 47 — @ai inline parsing + comparison triggers."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai_service import parse_ai_command


def test_default_ai_uses_single_fast_model():
    r = parse_ai_command("@ai what's a force majeure clause?")
    assert r["is_ai"] is True
    assert r["models"] == ["gpt-4o-mini"]
    assert r["default_models"] is True
    assert r["compare"] is False


def test_show_comparison_runs_all_models():
    r = parse_ai_command("@ai show comparison about Q3 pricing")
    assert r["compare"] is True
    assert len(r["models"]) == 5  # chatgpt + claude + gemini + perplexity + grok
    assert "claude" in r["models"]
    assert "comparison" not in r["question"].lower()


def test_show_all_comparison():
    r = parse_ai_command("@ai show all comparison for marketing copy")
    assert r["compare"] is True
    assert len(r["models"]) == 5
    assert "marketing copy" in r["question"].lower()


def test_compare_keyword_first_word():
    r = parse_ai_command("@ai compare pricing tiers")
    assert r["compare"] is True
    assert len(r["models"]) == 5


def test_compare_across_models():
    r = parse_ai_command("@ai compare across models: best CRM for SMB")
    assert r["compare"] is True
    assert len(r["models"]) == 5


def test_ask_all_legacy_still_works():
    r = parse_ai_command("@ai ask all models about Q3 pricing")
    assert r["compare"] is True
    assert len(r["models"]) == 5


def test_specific_model_ask():
    r = parse_ai_command("@ai ask claude to draft an email")
    assert r["compare"] is False
    assert r["models"] == ["claude"]


def test_no_at_ai_is_not_ai():
    assert parse_ai_command("hello there").get("is_ai") is False
    assert parse_ai_command("show me comparison").get("is_ai") is False
