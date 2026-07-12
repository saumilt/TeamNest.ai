"""Seed 'Perfect Restaurant Group' sample data for Role Intelligence (Phase A).

Idempotent per workspace — safe to call repeatedly. Creates roles, enterprise
employee records, role-intelligence profiles, a few source-grounded memories,
and continuity scores matching the product spec sample.
"""
from deps import db, new_id, now_iso

PRICE_PER_SEAT = 29.99


async def seed_enterprise(workspace_id: str, actor_id: str, amit_user_id: str | None = None) -> dict:
    existing = await db.enterprise_users.count_documents({"workspace_id": workspace_id})
    if existing:
        return {"seeded": False, "reason": "already has data"}

    now = now_iso()

    def role(name, dept, desc, resp, daily, weekly, monthly, systems, approval, escalation, metrics):
        return {
            "id": new_id(), "workspace_id": workspace_id, "role_name": name, "department": dept,
            "description": desc, "responsibilities": resp, "daily_tasks": daily,
            "weekly_tasks": weekly, "monthly_tasks": monthly, "systems_used": systems,
            "approval_authority": approval, "escalation_rules": escalation,
            "success_metrics": metrics, "active_employee_user_id": None,
            "backup_employee_user_id": None, "created_at": now, "updated_at": now,
        }

    finance = role(
        "Finance Manager", "Finance",
        "Owns monthly close, vendor payments, sales-tax filing and location reporting across all restaurants.",
        ["Monthly closing process", "Vendor payment approval", "Sales-tax filing workflow",
         "Restaurant location reporting", "Bank reconciliation", "Landlord payment history"],
        ["Review pending vendor invoices", "Approve payments under $5k"],
        ["Reconcile bank feeds", "Update location P&L"],
        ["Monthly close", "Sales-tax filing", "Landlord payments", "Location reporting pack"],
        ["QuickBooks Online", "Excel", "Bank portal"],
        "Approves vendor payments up to $25k; above escalates to CFO.",
        "Escalate disputed invoices to CFO; tax questions to external accountant.",
        ["Close completed by business day 5", "Zero late tax filings"],
    )
    ops = role(
        "Restaurant Operations Manager", "Operations",
        "Runs day-to-day restaurant operations, service standards, labor scheduling and guest recovery.",
        ["Opening and closing procedures", "Service-level standards", "Vendor escalation",
         "Labor scheduling", "Location audit process", "Guest complaint resolution"],
        ["Review overnight reports", "Approve daily labor schedule"],
        ["Location audits", "Vendor performance review"],
        ["Monthly ops review", "Service-standard scorecards"],
        ["Toast POS", "7shifts", "Google Workspace"],
        "Approves comps/refunds up to $500; vendor changes to Finance.",
        "Escalate repeated SLA breaches to Sales Director; safety issues immediately.",
        ["CSAT > 4.5", "Labor % within target"],
    )
    sales = role(
        "Sales Director", "Sales",
        "Owns major client relationships, pricing exceptions, proposals and renewals.",
        ["Major client relationships", "Pricing exceptions", "Proposal process",
         "Media sales workflow", "Sales objection handling", "Renewal process"],
        ["Review pipeline", "Respond to key client threads"],
        ["Renewal forecast", "Proposal reviews"],
        ["Quarterly business reviews", "Renewal cycle planning"],
        ["HubSpot", "Google Workspace", "Proposal tool"],
        "Approves pricing exceptions up to 15%; beyond escalates to regional director.",
        "Escalate pricing exceptions to regional director before responding to client.",
        ["Renewal rate > 90%", "Pipeline coverage 3x"],
    )
    await db.enterprise_roles.insert_many([dict(finance), dict(ops), dict(sales)])

    def emp(name, email, role_id, dept, status, unique, successor, backup_id=None, user_id=None):
        return {
            "id": new_id(), "workspace_id": workspace_id, "user_id": user_id,
            "employee_name": name, "employee_email": email, "role_id": role_id,
            "department": dept, "manager_user_id": None, "location": "HQ",
            "start_date": "2022-01-10", "employment_status": status,
            "enterprise_license_status": "active", "backup_user_id": backup_id,
            "successor_user_id": None, "knowledge_transfer_status": "not_started",
            "unique_knowledge_level": unique, "created_at": now, "updated_at": now,
        }

    priya = emp("Priya Shah", "priya@perfectrestaurant.group", finance["id"], "Finance", "Departing", "High", None)
    amit = emp("Amit Patel", "amit@demo.team", sales["id"], "Sales", "Active", "Critical", None, user_id=amit_user_id)
    raj = emp("Raj Mehta", "raj@perfectrestaurant.group", ops["id"], "Operations", "Active", "Medium", None, backup_id=amit["id"])
    await db.enterprise_users.insert_many([dict(priya), dict(amit), dict(raj)])

    await db.enterprise_roles.update_one({"id": finance["id"]}, {"$set": {"active_employee_user_id": priya["id"]}})
    await db.enterprise_roles.update_one({"id": ops["id"]}, {"$set": {"active_employee_user_id": raj["id"], "backup_employee_user_id": amit["id"]}})
    await db.enterprise_roles.update_one({"id": sales["id"]}, {"$set": {"active_employee_user_id": amit["id"]}})

    def profile(role_id, summary, sops, workflows, questions, decisions, relationships, risks, deadlines):
        return {
            "id": new_id(), "workspace_id": workspace_id, "role_id": role_id,
            "role_summary": summary, "sops": sops, "workflow_steps": workflows,
            "common_questions": questions, "decision_history": decisions,
            "relationships": relationships, "known_risks": risks, "deadlines": deadlines,
            "templates": [], "checklists": [], "lessons_learned": [], "created_at": now, "updated_at": now,
        }

    await db.enterprise_role_profiles.insert_many([
        dict(profile(finance["id"],
            "Finance Manager owning monthly close, vendor payments and tax filings for all locations.",
            ["Monthly close by BD5", "Vendor payment approval workflow", "Sales-tax filing"],
            ["Pull location P&Ls → reconcile → CFO review → publish pack"],
            ["What is the process for the monthly report?", "Who approves vendor payments?"],
            [{"decision": "Switched landlord payments to ACH", "reason": "Cut fees ~$1.2k/mo", "approver": "CFO", "date": "2024-02-11"}],
            [{"org": "Sysco", "type": "Vendor", "notes": "Primary food supplier; net-30 terms"}],
            ["Single-person dependency on monthly close", "Landlord payment history undocumented"],
            ["Sales-tax filing 20th monthly", "Close by BD5"])),
        dict(profile(ops["id"],
            "Operations Manager running service standards, scheduling and guest recovery.",
            ["Opening/closing checklist", "Guest complaint resolution playbook", "Location audit"],
            ["Complaint → acknowledge → comp within policy → log → follow up in 48h"],
            ["How was a recurring service-level complaint handled before?", "What is the audit process?"],
            [{"decision": "Added pre-shift huddle at The Colony", "reason": "Reduce SLA complaints", "approver": "Raj Mehta", "date": "2024-03-20"}],
            [{"org": "The Colony (location)", "type": "Internal", "notes": "Highest complaint volume; watch weekend dinner"}],
            ["Guest recovery depends on Raj's judgment", "Vendor escalation not documented"],
            ["Weekly location audits", "Monthly ops review"])),
        dict(profile(sales["id"],
            "Sales Director owning key relationships, pricing exceptions and renewals.",
            ["Proposal process", "Pricing exception approval", "Renewal cadence"],
            ["Pricing exception → check margin → escalate to regional director → respond to client"],
            ["How were pricing exceptions handled?", "What is the renewal process?"],
            [{"decision": "Standardized 2-day renewal follow-up", "reason": "Higher renewal rate", "approver": "Amit Patel", "date": "2024-01-30"}],
            [{"org": "Major Media Client", "type": "Client", "notes": "Escalate pricing to regional director first"}],
            ["Critical single-person dependency on top accounts", "Pricing logic undocumented"],
            ["Q3 renewals", "Quarterly business reviews"])),
    ])

    # A few source-grounded sample memories (for grounding demos in Phase B).
    await db.enterprise_role_memories.insert_many([
        {"id": new_id(), "workspace_id": workspace_id, "role_id": ops["id"], "source_user_id": raj["id"],
         "source_type": "TeamNest chat", "source_id": "sample-chat-colony", "memory_type": "issue_resolution",
         "title": "Recurring service-level complaints at The Colony",
         "content": "Raj resolved recurring weekend SLA complaints by adding a pre-shift huddle and a 48-hour guest follow-up, comping within the $500 policy and escalating repeat offenders.",
         "sensitivity_level": "internal", "visibility": "role", "transferable": True,
         "approved_by_user_id": actor_id, "approval_status": "approved", "retention_policy": "keep_indefinitely",
         "confidence": 0.86, "source_date": "2024-03-20", "last_reviewed_at": now, "created_at": now, "updated_at": now},
        {"id": new_id(), "workspace_id": workspace_id, "role_id": ops["id"], "source_user_id": raj["id"],
         "source_type": "Task", "source_id": "sample-task-audit", "memory_type": "process",
         "title": "The Colony weekend audit follow-up",
         "content": "Weekend audits at The Colony flagged slow table turns; standardized a checklist and pre-shift huddle.",
         "sensitivity_level": "internal", "visibility": "role", "transferable": True,
         "approved_by_user_id": actor_id, "approval_status": "approved", "retention_policy": "keep_indefinitely",
         "confidence": 0.78, "source_date": "2024-03-22", "last_reviewed_at": now, "created_at": now, "updated_at": now},
        {"id": new_id(), "workspace_id": workspace_id, "role_id": ops["id"], "source_user_id": raj["id"],
         "source_type": "Meeting", "source_id": "sample-meeting-ops", "memory_type": "decision",
         "title": "Ops review decision — pre-shift huddles",
         "content": "Decided to roll pre-shift huddles to all high-volume locations after The Colony results.",
         "sensitivity_level": "internal", "visibility": "role", "transferable": True,
         "approved_by_user_id": actor_id, "approval_status": "approved", "retention_policy": "keep_indefinitely",
         "confidence": 0.8, "source_date": "2024-03-25", "last_reviewed_at": now, "created_at": now, "updated_at": now},
    ])

    def score(role_id, overall, risk):
        return {"id": new_id(), "workspace_id": workspace_id, "role_id": role_id,
                "overall_score": overall, "risk_level": risk,
                "role_description_score": overall, "sop_score": max(0, overall - 5),
                "workflow_score": overall, "recurring_task_score": overall,
                "relationship_score": max(0, overall - 10), "decision_score": overall,
                "communication_score": max(0, overall - 8), "expertise_score": overall,
                "successor_score": 0 if overall < 50 else 60, "review_score": overall,
                "calculated_at": now}

    await db.enterprise_knowledge_scores.insert_many([
        dict(score(finance["id"], 42, "High")),
        dict(score(ops["id"], 81, "Medium")),
        dict(score(sales["id"], 28, "Critical")),
    ])

    await db.enterprise_licenses.update_one(
        {"workspace_id": workspace_id},
        {"$set": {"workspace_id": workspace_id, "seats_purchased": 3, "seats_assigned": 3,
                  "price_per_seat": PRICE_PER_SEAT, "updated_at": now},
         "$setOnInsert": {"id": new_id(), "created_at": now}},
        upsert=True,
    )
    return {"seeded": True, "roles": 3, "employees": 3}
