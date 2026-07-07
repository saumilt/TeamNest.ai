"""TeamNest Dev OS — Template Library (Phase 2).

A small set of curated project starters that skip the wizard's blank-page
moment. Each template provides a name, description, problem statement,
business model, requirements, and an optional pre-seeded plan so users can
clone-and-tweak instead of writing from scratch.

Templates are deliberately broad — the user customises name/description on
import and the Product CEO can still refine the plan on demand.
"""
from typing import Any, Dict, List

TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "ap-ledger",
        "name": "Accounts Payable (AP Ledger)",
        "category": "finance",
        "icon": "Receipt",
        "tagline": "Multi-entity AP with role-based approvals + recurring detection",
        "best_for": "Finance teams demoing approval workflows and statement import",
        "code_template": "ap_ledger",
        "brief": {
            "name": "AP Ledger",
            "description": "Multi-entity accounts payable app with role-based approval workflows and bank-statement recurring-transaction detection",
            "target_users": "AP clerks, AP managers and controllers at multi-entity companies",
            "problem": "AP teams juggle invoices across entities with no approval control. Need: entity switcher, roles (Clerk creates, Manager approves to $10k, Controller approves anything), approval history trail, and CSV statement import that auto-detects recurring vendors.",
            "business_model": {"pricing": "subscription", "price_point": "$99/mo per entity"},
            "requirements": {
                "must_have": "Role login, multi-entity invoices, approval queue with limits, rejection reasons, history trail, statement import with recurring detection",
                "nice_to_have": "Email notifications, vendor management, payment scheduling",
                "compliance": "SOX-friendly audit trail",
            },
        },
    },
    {
        "id": "saas-dashboard",
        "name": "SaaS Dashboard",
        "category": "saas",
        "icon": "BarChart3",
        "tagline": "Multi-tenant analytics dashboard with auth + billing",
        "best_for": "B2B SaaS founders shipping a metrics dashboard MVP",
        "brief": {
            "name": "My SaaS Dashboard",
            "description": "Multi-tenant analytics dashboard for SMB teams",
            "target_users": "Operations leads at 10-200 person companies",
            "problem": "Teams need a single dashboard to track KPIs across tools. Spreadsheets break, BI is too heavy. Need: easy data import (CSV / API), saved views, share-with-team, alerts when metrics drift.",
            "business_model": {"pricing": "subscription", "price_point": "$49/mo per seat"},
            "requirements": {
                "must_have": "Workspace auth, dashboard builder, CSV import, charts, sharing",
                "nice_to_have": "Slack alerts, BI tool sync, embedded analytics",
                "compliance": "SOC 2 ready, GDPR, audit log",
            },
        },
    },
    {
        "id": "marketplace",
        "name": "Two-sided Marketplace",
        "category": "marketplace",
        "icon": "Store",
        "tagline": "Buyer + seller flows with Stripe Connect + reviews",
        "best_for": "Founders launching a niche services or goods marketplace",
        "brief": {
            "name": "My Marketplace",
            "description": "Two-sided marketplace connecting buyers and sellers",
            "target_users": "Sellers offering services or physical goods; buyers seeking trusted matches",
            "problem": "Buyers can't find vetted sellers. Sellers need an easy way to list, accept payments, and build reputation. Need: profiles, search, booking/checkout, escrow via Stripe Connect, reviews, dispute flow.",
            "business_model": {"pricing": "usage", "price_point": "8% commission per transaction"},
            "requirements": {
                "must_have": "Seller onboarding, listings, search/filter, checkout, Stripe Connect, reviews",
                "nice_to_have": "Messaging, calendar booking, dispute center, seller analytics",
                "compliance": "PCI via Stripe, KYC for sellers, refund policy",
            },
        },
    },
    {
        "id": "internal-tool",
        "name": "Internal Ops Tool",
        "category": "internal",
        "icon": "Settings",
        "tagline": "Admin CRUD app with role-based access",
        "best_for": "Ops teams replacing a brittle Airtable / Sheet workflow",
        "brief": {
            "name": "Ops Tool",
            "description": "Internal CRUD app to replace a manual workflow",
            "target_users": "Operations team (5-50 users)",
            "problem": "Ops team manages records across spreadsheets and Slack threads. Mistakes happen, audit is impossible. Need: tables with role-based access, edit history, bulk import, custom views, exports.",
            "business_model": {"pricing": "enterprise", "price_point": "Per-org licence"},
            "requirements": {
                "must_have": "RBAC, CRUD tables, search, edit history, CSV import/export",
                "nice_to_have": "Webhooks, custom fields, scheduled reports",
                "compliance": "SSO (SAML), audit log, RBAC granular permissions",
            },
        },
    },
    {
        "id": "mobile-companion",
        "name": "Mobile Companion App",
        "category": "mobile",
        "icon": "Smartphone",
        "tagline": "Native-feeling React/Capacitor app with push + offline",
        "best_for": "Teams who already have a web app and need an iOS/Android companion",
        "brief": {
            "name": "My Mobile App",
            "description": "Mobile companion app to an existing web product",
            "target_users": "Existing web app users who want on-the-go access",
            "problem": "Power users live on mobile but the current web app isn't responsive enough. Need: native-feeling UI, push notifications, offline-first reads, deep linking from email/SMS, app store ready.",
            "business_model": {"pricing": "freemium", "price_point": "Free tier + $9/mo Pro"},
            "requirements": {
                "must_have": "Capacitor shell, auth shared with web, push notifications, offline caching, deep links",
                "nice_to_have": "Biometric login, share extension, widget",
                "compliance": "App store privacy labels, GDPR data export",
            },
        },
    },
    {
        "id": "ai-assistant",
        "name": "AI Assistant Product",
        "category": "ai",
        "icon": "Sparkles",
        "tagline": "Chat-based AI helper for a specific vertical",
        "best_for": "Founders shipping an AI-first product in a niche (legal, ops, sales…)",
        "brief": {
            "name": "AI Assistant",
            "description": "Domain-specific AI assistant",
            "target_users": "Knowledge workers in a single vertical (e.g. paralegals, recruiters)",
            "problem": "Generic LLMs don't know the user's data or workflow. We want a vertical assistant: chat UI, ingestion of user docs (RAG), suggested actions, workspace memory, usage metering.",
            "business_model": {"pricing": "usage", "price_point": "$29 base + credit packs"},
            "requirements": {
                "must_have": "Chat UI, RAG over user uploads, workspace memory, credit metering, system prompts per vertical",
                "nice_to_have": "Multi-model routing, function calling, voice input",
                "compliance": "PII redaction, data residency option, no-train opt-out",
            },
        },
    },
    # ─── Phase 3b additions ────────────────────────────────────────────────
    *[{
        "id": tid,
        "name": name,
        "category": cat,
        "icon": icon,
        "tagline": tag,
        "best_for": best,
        "brief": {"name": name, "description": tag, "target_users": users, "problem": problem,
                  "business_model": {"pricing": "subscription", "price_point": price},
                  "requirements": {"must_have": must, "nice_to_have": "", "compliance": ""}},
    } for tid, name, cat, icon, tag, best, users, problem, price, must in [
        ("franchise-mgmt", "Restaurant Franchise Platform", "franchise", "Store",
         "Franchisor + franchisee dashboards · royalty tracking · training · compliance",
         "Restaurant franchisors with 10-200 locations",
         "Franchisor admins and store managers",
         "Royalty tracking, training, support, compliance all live in spreadsheets — need a single multi-tenant platform.",
         "$199/mo per franchise", "RBAC, royalty calc, training library, support tickets, sales reports"),
        ("real-estate-crm", "Real Estate CRM", "crm", "Building2",
         "Listings + buyers + showings + offer pipeline",
         "Small-mid brokerages (5-50 agents)",
         "Agents, brokers, transaction coordinators",
         "Agents juggle listings, leads, showings, and offers across email + spreadsheets. Want a single dealflow CRM with mobile-first UX.",
         "$79/mo per agent", "Listings, buyer leads, showings calendar, offer tracking, MLS sync stub"),
        ("booking", "Booking Platform", "marketplace", "Calendar",
         "Service appointment booking with payments + reminders",
         "Service-based businesses needing online booking",
         "Salon, clinic, studio, repair-shop owners",
         "Customers want online booking, owners want no double-bookings + auto reminders.",
         "$39/mo per location", "Calendar UI, Stripe payments, SMS reminders, staff schedules, no-show protection"),
        ("event-community", "Event Community App", "community", "Users",
         "Conference companion app with attendee directory + agenda",
         "Conference organisers (200-5000 attendees)",
         "Event organisers + attendees + speakers",
         "Attendees want a single app for agenda, networking, Q&A; organisers want push announcements + lead capture for sponsors.",
         "$2000 / event", "Agenda, attendee directory, push announcements, Q&A, sponsor lead capture"),
        ("local-media-crm", "Local Media Ad-Sales CRM", "crm", "Megaphone",
         "Pipeline + proposals + campaign tracking for local media sellers",
         "Local newspaper / radio / podcast ad sales teams",
         "Account executives + sales managers",
         "Account execs juggle leads, proposals, campaigns, billing — across spreadsheets and email. Need vertical CRM.",
         "$99/mo per seat", "Lead pipeline, proposal builder, campaign tracking, simple invoicing"),
        ("admin-portal", "Internal Admin Portal", "internal", "Settings",
         "Multi-table admin app with RBAC + audit log",
         "Ops teams replacing Airtable / Sheets",
         "Operations team (5-50 users)",
         "Ops team manages records across spreadsheets and Slack. Need RBAC + audit log + bulk import.",
         "Enterprise per-seat", "RBAC, CRUD tables, edit history, bulk import, SSO"),
        ("investor-reporting", "Investor Reporting Dashboard", "saas", "TrendingUp",
         "Per-LP dashboards + quarterly updates + capital-call workflow",
         "Fund managers + family offices",
         "Fund managers + LPs",
         "LPs want polished per-fund dashboards. Managers want one tool for capital calls, distributions, quarterly updates.",
         "$499/mo per fund", "Per-LP dashboard, quarterly update wizard, capital call, distribution tracking"),
        ("healthcare-portal", "Healthcare Practice Portal", "healthcare", "Heart",
         "Patient portal + scheduling + intake forms (HIPAA-aware)",
         "Independent practices (1-20 providers)",
         "Providers + receptionists + patients",
         "Practices want online scheduling + intake forms + secure messaging without paying enterprise EHR prices.",
         "$149/mo per provider", "Scheduling, intake forms, secure messaging, HIPAA-aware audit log"),
        ("employee-marketplace", "AI Employee Marketplace", "ai", "Bot",
         "Hire vertical AI employees per-task with credit metering",
         "Workspaces that want pre-built AI agents on tap",
         "SMB owners + ops teams",
         "Users want plug-in AI employees per workflow (paralegal, bookkeeper, CMO) with predictable monthly cost.",
         "Usage-based credits", "Employee catalog, credit metering, trial periods, governance"),
        ("restaurant-ordering", "Restaurant Ordering Platform", "marketplace", "UtensilsCrossed",
         "Direct-from-restaurant ordering + delivery dispatch",
         "Independent restaurants tired of marketplace fees",
         "Restaurant owners + diners",
         "Restaurants pay 30% to marketplaces. They want their own ordering site with delivery dispatch + Stripe.",
         "$99/mo per location", "Menu builder, online ordering, Stripe, driver dispatch, kitchen display"),
        ("franchise-sales-crm", "Franchise Sales CRM", "crm", "Briefcase",
         "Lead-to-discovery-day pipeline for franchise development",
         "Franchisors selling new franchises",
         "Franchise development teams",
         "Franchise development teams track candidates through application → discovery day → award. Spreadsheets are losing leads.",
         "$249/mo per franchisor", "Lead intake, FDD tracking, discovery day scheduler, candidate scoring"),
    ]],
]


def list_templates() -> List[Dict[str, Any]]:
    """Return the template catalog stripped of large `brief` blobs — list view."""
    return [
        {k: v for k, v in t.items() if k != "brief"}
        for t in TEMPLATES
    ]


# One-click installable code templates (finished files shipped in /templates).
_CODE_TEMPLATES = {"booking": "booking", "real-estate-crm": "real_estate_crm"}
for _t in TEMPLATES:
    if _t["id"] in _CODE_TEMPLATES:
        _t["code_template"] = _CODE_TEMPLATES[_t["id"]]


def get_template(template_id: str) -> Dict[str, Any] | None:
    return next((t for t in TEMPLATES if t["id"] == template_id), None)
