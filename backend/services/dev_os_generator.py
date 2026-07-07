"""TeamNest Dev OS — AI generators (live LLM-backed).

Model routing per agent role:
  - Product CEO / Architect / Reviewer / QA / Security  →  Claude Sonnet 4.5 (deep reasoning, rigor)
  - Frontend / Backend / DevOps / Growth                →  GPT-4o          (broad code & ops knowledge)

Returns deterministic, JSON-shaped output for the UI to render. Falls back to a
structured stub on any LLM error so the UX never breaks.
"""
import asyncio
import json
import logging
from typing import Any, Dict

from ai_service import EMERGENT_LLM_KEY, LlmChat, UserMessage

logger = logging.getLogger("teamnest")

AGENT_MODEL_MAP = {
    "product_ceo":          ("anthropic", "claude-sonnet-4-6"),
    "architect":            ("anthropic", "claude-sonnet-4-6"),
    "reviewer":             ("anthropic", "claude-sonnet-4-6"),
    "qa":                   ("anthropic", "claude-sonnet-4-6"),
    "security":             ("anthropic", "claude-sonnet-4-6"),
    "frontend":             ("openai", "gpt-4o"),
    "backend":              ("openai", "gpt-4o"),
    "devops":               ("openai", "gpt-4o"),
    "growth":               ("openai", "gpt-4o"),
}

PROJECT_BRIEF_SYSTEM_PROMPT = """You are the Product CEO Agent inside TeamNest Dev OS.
Given a brief software idea, produce a complete product plan as STRICT JSON
matching this exact schema (no markdown, no commentary):

{
  "product_brief": "2-3 paragraphs explaining the product, users, and value",
  "user_roles": ["..."],
  "mvp_modules": [{"name": "...", "description": "..."}],
  "technical_stack": {"frontend": "...", "backend": "...", "database": "...", "infra": "..."},
  "database_entities": [{"name": "...", "fields": ["..."]}],
  "development_backlog": [{"title": "...", "owning_agent": "frontend|backend|qa|security|devops", "priority": "high|medium|low", "risk_level": "low|medium|high"}],
  "qa_checklist": ["..."],
  "security_checklist": ["..."],
  "deployment_plan": ["..."],
  "success_metrics": ["..."]
}

Be concrete. Tailor every output to the supplied idea + business model + requirements."""


def _stub_plan(idea: str) -> Dict[str, Any]:
    """Safety-net response when the LLM call fails — seeds a small but realistic
    backlog so the kanban doesn't look empty during budget outages."""
    return {
        "product_brief": f"Auto-generated plan for: {idea}. (LLM unavailable — using stub.)",
        "user_roles": ["Admin", "Member"],
        "mvp_modules": [
            {"name": "Core", "description": "Primary functionality."},
            {"name": "Auth", "description": "Sign up, sign in, sessions."},
            {"name": "Admin", "description": "Workspace + member management."},
        ],
        "technical_stack": {"frontend": "React + Tailwind", "backend": "FastAPI", "database": "MongoDB", "infra": "Render / Vercel"},
        "database_entities": [
            {"name": "users", "fields": ["id", "email", "role"]},
            {"name": "sessions", "fields": ["id", "user_id", "created_at"]},
        ],
        "development_backlog": [
            {"title": "Scaffold React + FastAPI app", "owning_agent": "frontend", "priority": "high", "risk_level": "low"},
            {"title": "Design data model + Mongo indexes", "owning_agent": "architect", "priority": "high", "risk_level": "low"},
            {"title": "Build auth (signup, login, sessions)", "owning_agent": "backend", "priority": "high", "risk_level": "medium"},
            {"title": "Build core UI flow", "owning_agent": "frontend", "priority": "high", "risk_level": "low"},
            {"title": "Write smoke + happy-path tests", "owning_agent": "qa", "priority": "medium", "risk_level": "low"},
            {"title": "Set up CI/CD + staging deploy", "owning_agent": "devops", "priority": "medium", "risk_level": "high"},
        ],
        "qa_checklist": ["Smoke test end-to-end happy path", "Auth: bad password rejected", "Error states render"],
        "security_checklist": ["Enable auth on every endpoint", "Rate-limit login", "Hash passwords with bcrypt"],
        "deployment_plan": ["Deploy to staging", "Smoke test", "Promote to prod"],
        "success_metrics": ["WAU", "Activation rate", "D7 retention"],
    }


async def generate_product_plan(idea: str, business_model: dict, requirements: dict, project_name: str) -> Dict[str, Any]:
    """Run the Product CEO agent over the supplied input. Returns a dict
    matching PROJECT_BRIEF_SYSTEM_PROMPT's JSON schema."""
    provider, model = AGENT_MODEL_MAP["product_ceo"]
    user_prompt = json.dumps({
        "project_name": project_name,
        "idea": idea,
        "business_model": business_model,
        "requirements": requirements,
    }, indent=2)
    try:
        session = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"devos-plan-{project_name[:20]}",
            system_message=PROJECT_BRIEF_SYSTEM_PROMPT,
        ).with_model(provider, model)
        raw = await asyncio.wait_for(
            session.send_message(UserMessage(text=user_prompt)), timeout=60.0,
        )
        text = str(raw).strip()
        # The model occasionally wraps JSON in ```json fences — strip them.
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:].strip()
        return json.loads(text)
    except Exception as e:
        logger.warning("[dev-os] product plan LLM failed: %s", e)
        return _stub_plan(idea)


PROPOSAL_SYSTEM_PROMPT = """You are a TeamNest Dev OS improvement agent. Given a
project context + a problem signal, propose ONE concrete improvement as JSON:

{
  "title": "short imperative sentence",
  "proposal_type": "bug_fix|ux|performance|security|revenue|template|agent_prompt|workflow|compliance|documentation",
  "current_problem": "1-2 sentence problem statement",
  "proposed_change": "1-2 sentence concrete change",
  "expected_impact": "1 sentence outcome",
  "risk_level": "low|medium|high",
  "required_approval_level": "auto_merge_after_tests|human_required|admin_required",
  "estimated_credits": 5
}

NEVER recommend auto_merge_after_tests for: auth, permissions, payments, financial logic,
database migrations, data deletion, healthcare/compliance, or production deployment.
Those MUST be human_required or admin_required."""


async def generate_proposal(project_summary: str, signal: str, role: str = "reviewer") -> Dict[str, Any]:
    provider, model = AGENT_MODEL_MAP.get(role, AGENT_MODEL_MAP["reviewer"])
    try:
        session = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"devos-proposal-{role}",
            system_message=PROPOSAL_SYSTEM_PROMPT,
        ).with_model(provider, model)
        raw = await asyncio.wait_for(
            session.send_message(UserMessage(text=json.dumps({"project": project_summary, "signal": signal}))),
            timeout=45.0,
        )
        text = str(raw).strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:].strip()
        plan = json.loads(text)
        plan["_llm_status"] = "live"
        return plan
    except Exception as e:
        logger.warning("[dev-os] proposal LLM failed: %s", e)
        return {
            "title": "Manual review needed",
            "proposal_type": "documentation",
            "current_problem": signal,
            "proposed_change": "Investigate and document next steps.",
            "expected_impact": "Clarity for the team.",
            "risk_level": "low",
            "required_approval_level": "human_required",
            "estimated_credits": 3,
            "_llm_status": "stub",
        }
