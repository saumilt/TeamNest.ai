"""AI Employees catalog — Phase 6.

Each employee has:
  key            — stable string id used in URLs / collections.
  name, role     — display.
  description    — marketing one-liner.
  monthly_price  — USD per month after trial.
  trial_days     — 7 by default.
  trial_credits  — credits granted during trial.
  monthly_credits — credits included with paid subscription.
  capabilities   — bullet list shown on the card.
  workflows      — named workflows available via @AI <employee> <workflow>.
  integrations   — list of strings (mostly placeholders).
  disclaimer     — auto-appended to every output for legal/financial/accounting roles.
  command        — the inline `@AI <command>` keyword.
  status         — "active" or "coming_soon".

Phase 6 Session 1 active: cmo, bookkeeper.
Everyone else is coming_soon and only renders as a card + waitlist button.
"""
from __future__ import annotations

from typing import Any, Dict, List

CMO_SYSTEM_PROMPT = (
    "You are AI CMO, a Chief Marketing Officer for TeamNest.ai customers. "
    "You produce concrete, actionable, modern marketing deliverables — not "
    "fluffy advice. Always: lead with the deliverable, use markdown headings "
    "and tables, include specific channels (Meta, Google, TikTok, Mailchimp, "
    "HubSpot), call out budget ranges in USD, and end with a 5-bullet 'next "
    "steps for the team' section. If the user is a restaurant or franchise, "
    "tailor copy to local SEO + Google Business Profile + grand opening "
    "playbooks. Never exceed 600 words unless explicitly asked. "
    "If the user asks a short conversational question (under 12 words), "
    "respond in under 100 words. Get to the point fast."
)

BOOKKEEPER_SYSTEM_PROMPT = (
    "You are AI QuickBooks Bookkeeper. You categorize bank and credit-card "
    "transactions into a standard chart of accounts. For each transaction "
    "you receive, output a single JSON object with: account (the suggested "
    "QuickBooks account name from this list: Advertising & Marketing, "
    "Office Supplies, Travel, Meals & Entertainment, Software & "
    "Subscriptions, Professional Fees, Rent, Utilities, Repairs & "
    "Maintenance, Payroll Expense, Bank Fees, Insurance, Telephone & "
    "Internet, Inventory Purchases, Owner Draw, Transfer, Sales Income, "
    "Refund, Other), confidence (0-100 integer), reason (one-sentence "
    "rationale), and is_transfer (boolean, true only if the description "
    "clearly indicates an internal transfer between owned accounts). Never "
    "invent merchants. If you cannot categorize with at least 60 percent "
    "confidence return account='Suspense' with confidence below 60."
)

RESTAURANT_ORDERS_SYSTEM_PROMPT = (
    "You are AI Restaurant Order Taking, a friendly host for a restaurant. "
    "Greet the customer warmly, take their order, confirm modifiers (size, "
    "spice, sides, allergens), upsell ONE complementary item per order, "
    "capture pickup vs delivery + ETA + phone number, and read the final "
    "order back as a numbered list with subtotal, tax (8%), and total. If "
    "the user asks menu questions, answer concisely and suggest 2 popular "
    "pairings. Never invent menu items — if the user names a dish you don't "
    "recognize, ask them to clarify. Keep replies under 120 words. End "
    "every confirmed order with the line: 'Order confirmed · ETA: <time>.'"
)

BILL_PAY_SYSTEM_PROMPT = (
    "You are AI Bill Pay, an Accounts Payable assistant. You help finance "
    "teams process vendor bills. For each invoice the user shares, extract: "
    "vendor name, invoice number, invoice date, due date, line items (qty x "
    "description x unit price), subtotal, tax, total, and matching PO (if "
    "any). Flag potential duplicates by checking vendor + invoice number "
    "patterns the user has mentioned earlier in this conversation. Route "
    "approvals as: '<$500 auto-approve, $500-5000 manager, >$5000 CFO'. "
    "Output is always: a structured JSON summary first, then a 2-sentence "
    "plain-English note. Never schedule payments without explicit user "
    "confirmation. End every reply with 'Awaiting your approval to proceed.'"
)

ACTIVE_EMPLOYEES: List[Dict[str, Any]] = [
    {
        "key": "cmo",
        "name": "AI CMO",
        "role": "Chief Marketing Officer",
        "command": "AI CMO",
        "description": (
            "AI Chief Marketing Officer that plans, drafts, and analyzes marketing "
            "strategy for restaurants, franchises, real estate, and local businesses."
        ),
        "monthly_price": 149,
        "trial_days": 7,
        "trial_credits": 500,
        "monthly_credits": 3000,
        "credits_per_task_estimate": 15,
        "hours_saved_per_task": 0.75,
        "market_billable_rate_usd": 180,
        "capabilities": [
            "30-day marketing calendars",
            "Grand opening campaigns",
            "Brand positioning",
            "Ad copy (Meta, Google, TikTok)",
            "Email campaigns",
            "Customer segmentation",
            "Local SEO + Google Business",
            "Franchise lead generation",
            "Real estate project marketing",
            "Weekly performance reports",
        ],
        "workflows": [
            "30-day marketing calendar",
            "Grand opening campaign",
            "Franchise lead campaign",
            "Real estate project campaign",
            "Weekly performance report",
            "Social content plan",
            "Email newsletter campaign",
            "Local influencer outreach",
            "Google Ads brief",
            "Meta Ads brief",
        ],
        "integrations": [
            "Google Ads", "Meta Ads", "Instagram", "TikTok",
            "Mailchimp", "HubSpot", "Google Analytics", "Canva",
        ],
        "disclaimer": None,
        "system_prompt": CMO_SYSTEM_PROMPT,
        "default_model": "gpt-4o-mini",
        "status": "active",
    },
    {
        "key": "sales",
        "name": "AI Sales Employee",
        "role": "Sales Development",
        "command": "AI Sales",
        "description": (
            "AI sales development rep that researches prospects, drafts outreach, "
            "manages follow-ups, and prepares sales materials."
        ),
        "monthly_price": 99,
        "trial_days": 7,
        "trial_credits": 300,
        "monthly_credits": 2000,
        "credits_per_task_estimate": 12,
        "hours_saved_per_task": 0.5,
        "market_billable_rate_usd": 95,
        "capabilities": [
            "Lead research",
            "Prospect qualification",
            "Outreach email drafts",
            "LinkedIn message drafts",
            "Follow-up sequences",
            "Sales call briefs",
            "Proposal outlines",
            "Lead scoring",
            "CRM-ready notes",
            "Franchise / investor outreach",
        ],
        "workflows": [
            "Research 25 prospects",
            "Draft cold outreach",
            "Draft follow-up sequence",
            "Build discovery call brief",
            "Draft local advertiser pitch",
            "Investor outreach sequence",
            "Weekly pipeline summary",
        ],
        "integrations": ["HubSpot", "Salesforce", "Gmail", "Outlook", "LinkedIn", "Google Sheets"],
        "disclaimer": None,
        "system_prompt": (
            "You are AI Sales, a senior B2B sales development rep. Always lead with the "
            "deliverable. Produce: bulleted prospect lists with company/role/why-now, "
            "cold emails under 90 words, follow-up sequences as numbered steps with timing "
            "(Day 0, Day 3, Day 7), discovery call briefs with 5 questions. Tailor copy to "
            "the user's industry. Never invent prospect names — when researching, give "
            "categories and signals rather than fictional company names. Stay under 500 words."
        ),
        "default_model": "gpt-4o-mini",
        "status": "active",
    },
    {
        "key": "paralegal",
        "name": "AI Paralegal Associate",
        "role": "Legal Document Review",
        "command": "AI Paralegal",
        "description": (
            "Organizes, summarizes, and reviews contracts and legal documents. "
            "Extracts deadlines, obligations, and red flags for attorney review."
        ),
        "monthly_price": 199,
        "trial_days": 7,
        "trial_credits": 500,
        "monthly_credits": 4000,
        "credits_per_task_estimate": 25,
        "hours_saved_per_task": 1.5,
        "market_billable_rate_usd": 350,
        "capabilities": [
            "Legal document summaries",
            "Deadline extraction",
            "Obligation extraction",
            "Default / cure period extraction",
            "Contract version comparison",
            "Issue lists",
            "Diligence checklists",
            "Attorney review memos",
            "Closing checklists",
            "Signature tracking",
        ],
        "workflows": [
            "Summarize contract",
            "Extract deadlines + obligations",
            "Compare two versions",
            "Build closing checklist",
            "Red flag memo",
            "Attorney question list",
        ],
        "integrations": ["Document upload", "PDF/DOCX reading", "Contract comparison"],
        "disclaimer": (
            "AI Paralegal Associate does not provide legal advice. Outputs are for "
            "organization, summarization, and attorney review only. All legal "
            "conclusions must be reviewed by licensed counsel."
        ),
        "system_prompt": (
            "You are AI Paralegal Associate. You summarize and analyze contracts and "
            "legal documents for an attorney's review. NEVER provide legal advice or "
            "draw legal conclusions. ALWAYS prefix outputs with this disclaimer in a "
            "blockquote: '> Disclaimer: This is a working paralegal summary for "
            "attorney review. Not legal advice.' Use clear sections: 1) Document type, "
            "2) Parties, 3) Key dates and deadlines, 4) Material obligations, "
            "5) Default and cure periods, 6) Indemnity / liability provisions, "
            "7) Red flags for attorney. Use tables for deadlines. Keep under 700 words."
        ),
        "default_model": "claude-haiku",
        "status": "active",
    },
    {
        "key": "bookkeeper",
        "name": "AI QuickBooks Bookkeeper",
        "role": "Bookkeeping & Reconciliation",
        "command": "AI Bookkeeper",
        "description": (
            "Imports bank and credit-card statements, categorizes every transaction, "
            "asks staff to clarify suspense items in chat, learns reusable rules, "
            "and prepares approved entries for QuickBooks Online sync."
        ),
        "monthly_price": 249,
        "trial_days": 7,
        "trial_credits": 500,
        "monthly_credits": 3000,
        "credits_per_task_estimate": 100,
        "hours_saved_per_task": 2.0,
        "market_billable_rate_usd": 120,
        "capabilities": [
            "Bank statement import (CSV / PDF / OFX)",
            "Credit card statement import",
            "AI transaction categorization",
            "Suspense review with staff Q&A in chat",
            "Auto-generated bookkeeping rules",
            "Duplicate detection",
            "Reconciliation workflow",
            "Pending-sync approval queue",
            "Audit trail of every AI suggestion",
            "QuickBooks Online OAuth + write-back",
        ],
        "workflows": [
            "Import bank statement",
            "Import credit card statement",
            "Categorize uploaded transactions",
            "Resolve suspense item",
            "Reconcile period",
            "Generate close summary",
            "Sync approved entries to QuickBooks",
        ],
        "integrations": [
            "QuickBooks Online (sandbox)",
            "CSV upload",
            "PDF upload",
            "OFX/QBO upload",
        ],
        "disclaimer": (
            "AI QuickBooks Bookkeeper provides bookkeeping assistance and "
            "categorization suggestions only. It is not a CPA, tax advisor, "
            "or auditor. All accounting and tax classifications must be "
            "reviewed by qualified staff or accounting professionals."
        ),
        "system_prompt": BOOKKEEPER_SYSTEM_PROMPT,
        "default_model": "gpt-4o-mini",
        "status": "active",
    },
]

COMING_SOON_EMPLOYEES: List[Dict[str, Any]] = [
    {
        "key": "financial_modeler",
        "name": "AI Financial Modeler",
        "role": "Real Estate & Investment Modeling",
        "description": (
            "Builds development pro formas, rental property models, waterfalls "
            "with preferred returns and GP promote, and sensitivity tables."
        ),
        "monthly_price": 299,
        "trial_days": 7,
        "trial_credits": 750,
        "monthly_credits": 5000,
        "capabilities": [
            "Development pro formas",
            "Rental property models",
            "Investor return models",
            "Complex waterfalls",
            "Preferred return + GP promote",
            "IRR / equity-multiple hurdles",
            "Construction & permanent loans",
            "Sensitivity tables",
            "Scenario comparisons",
            "Excel-style export",
        ],
        "integrations": ["Excel export", "Google Sheets", "PDF investor summary"],
        "disclaimer": (
            "AI Financial Modeler produces analytical models for review and is "
            "not a licensed financial advisor, CPA, securities professional, or "
            "investment adviser."
        ),
        "status": "coming_soon",
    },
    {
        "key": "restaurant_orders",
        "name": "AI Restaurant Order Taking",
        "role": "Voice & Chat Order Taking (Restaurants)",
        "command": "AI Restaurant",
        "description": (
            "Takes customer orders by phone and chat, answers menu questions, "
            "upsells items, and routes orders to staff or POS."
        ),
        "monthly_price": 199,
        "trial_days": 7,
        "trial_credits": 400,
        "monthly_credits": 2500,
        "credits_per_task_estimate": 6,
        "hours_saved_per_task": 0.25,
        "market_billable_rate_usd": 35,
        "capabilities": [
            "Phone order taking",
            "Chat order taking",
            "Menu Q&A",
            "Upsells",
            "Pickup / delivery capture",
            "SMS confirmation",
            "Kitchen dashboard",
            "POS integrations (Toast, Square, Clover)",
            "DoorDash / Uber Eats handoff",
            "Twilio voice + website chat",
        ],
        "integrations": ["Toast", "Square", "Clover", "DoorDash", "Uber Eats", "Twilio"],
        "disclaimer": None,
        "system_prompt": RESTAURANT_ORDERS_SYSTEM_PROMPT,
        "default_model": "gpt-4o-mini",
        "status": "active",
    },
    {
        "key": "bill_pay",
        "name": "AI Bill Pay / Accounts Payable",
        "role": "AP Automation",
        "command": "AI Bill Pay",
        "description": (
            "Imports bills, reads invoices, routes approvals, detects duplicates, "
            "prepares payment batches, and integrates with Bill.com."
        ),
        "monthly_price": 249,
        "trial_days": 7,
        "trial_credits": 500,
        "monthly_credits": 3000,
        "credits_per_task_estimate": 10,
        "hours_saved_per_task": 0.5,
        "market_billable_rate_usd": 75,
        "capabilities": [
            "Invoice intake",
            "Vendor matching",
            "Duplicate invoice detection",
            "Approval routing",
            "AP aging",
            "Bill.com integration",
            "Payment scheduling after approval",
            "Audit trail",
        ],
        "integrations": ["Bill.com", "QuickBooks AP", "NetSuite", "Bank payment"],
        "disclaimer": "AI Bill Pay never schedules a payment without your explicit approval.",
        "system_prompt": BILL_PAY_SYSTEM_PROMPT,
        "default_model": "claude-haiku",
        "status": "active",
    },
]

ALL_EMPLOYEES = ACTIVE_EMPLOYEES + COMING_SOON_EMPLOYEES
# Re-derive the active / coming-soon partitions by the canonical `status` field
# so an employee can graduate from "coming_soon" by simply flipping its status.
ACTIVE_EMPLOYEES = [e for e in ALL_EMPLOYEES if e.get("status") == "active"]
COMING_SOON_EMPLOYEES = [e for e in ALL_EMPLOYEES if e.get("status") != "active"]


def get_employee(key: str) -> Dict[str, Any] | None:
    for emp in ALL_EMPLOYEES:
        if emp["key"] == key:
            return emp
    return None


def public_employee(emp: Dict[str, Any]) -> Dict[str, Any]:
    """Strip server-only fields before returning to the client."""
    return {k: v for k, v in emp.items() if k not in ("system_prompt", "default_model")}
