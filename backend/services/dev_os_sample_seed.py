"""Dev OS — showcase sample project seeder.

Idempotently creates the "Restaurant Franchise Management Platform" sample
project + a successful mock build + a live preview + a mock GitHub PR so the
demo-login experience lands on a fully-populated Build Console.
"""
from deps import db, new_id, now_iso

SAMPLE_NAME = "Restaurant Franchise Management Platform"


async def seed_franchise_sample(workspace_id: str, user_id: str) -> None:
    existing = await db.dev_projects.find_one(
        {"workspace_id": workspace_id, "name": SAMPLE_NAME}, {"_id": 0, "id": 1},
    )
    if existing:
        return  # idempotent

    project = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "created_by": user_id,
        "name": SAMPLE_NAME,
        "description": "SaaS for restaurant franchisors to manage franchisees, royalties, training, support tickets, compliance, and sales reporting.",
        "target_users": "Restaurant franchisors with 10-200 locations",
        "problem": "Franchisors juggle royalty tracking, training, support, compliance, and sales reporting across spreadsheets, email and the franchisee phone tree. We need a single platform with role-based dashboards.",
        "source": "research",
        "template_id": None,
        "related_chat_id": None,
        "plan": {
            "product_brief": "Multi-tenant franchise management SaaS.",
            "user_roles": ["Franchisor admin", "Multi-unit franchisee", "Store manager"],
            "mvp_modules": [
                {"name": "Franchisee onboarding", "description": "Application + agreement + welcome kit"},
                {"name": "Royalty tracking", "description": "Auto-calc + audit trail + exports"},
                {"name": "Support tickets", "description": "Per-store inbox + SLA"},
                {"name": "Training library", "description": "Doc + video uploads"},
                {"name": "Sales reporting", "description": "Charts + POS imports"},
                {"name": "RBAC", "description": "Role-based access control across all modules"},
            ],
            "technical_stack": {"frontend": "React + Tailwind", "backend": "FastAPI", "database": "MongoDB", "infra": "Render"},
            "_llm_status": "stub",
        },
        "status": "preview_ready",
        "version": "v0.4.2",
        "health": "stable",
        "test_coverage": 73,
        "open_proposals": 4,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_projects.insert_one(project.copy())

    # 4 backlog tasks — feels alive.
    for title, agent, status in [
        ("Build franchisee onboarding flow", "frontend", "in_progress"),
        ("Add royalty calculation module", "backend", "in_review"),
        ("Create support ticket dashboard", "frontend", "backlog"),
        ("Implement role-based permissions", "backend", "done"),
    ]:
        await db.dev_tasks.insert_one({
            "id": new_id(),
            "workspace_id": workspace_id,
            "project_id": project["id"],
            "title": title,
            "owning_agent": agent,
            "priority": "high",
            "risk_level": "medium",
            "status": status,
            "estimated_credits": 8,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })

    # Successful build #1 → unlocks Preview + GitHub PR flows.
    build_id = new_id()
    await db.dev_builds.insert_one({
        "id": build_id,
        "workspace_id": workspace_id,
        "project_id": project["id"],
        "build_number": 1,
        "build_status": "success",
        "build_summary": "Initial build · all stages green",
        "preview_url": f"https://preview.teamnest.ai/dev-os/{project['id']}/v1",
        "tests_passed": True,
        "security_passed": True,
        "performance_score": 88,
        "created_by_employee_id": "system",
        "approved_by_user_id": user_id,
        "credits_used": 62,
        "timeline": [
            {"stage": s, "at": now_iso(), "by": "devops"}
            for s in ("queued", "planning", "scaffolding", "frontend", "backend", "qa", "security", "preview", "complete")
        ],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })

    await db.dev_preview_deployments.insert_one({
        "id": new_id(),
        "workspace_id": workspace_id,
        "project_id": project["id"],
        "build_id": build_id,
        "preview_url": f"https://preview.teamnest.ai/dev-os/{project['id']}/v1",
        "status": "live",
        "share_token": new_id().split("-")[0],
        "created_by": user_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
