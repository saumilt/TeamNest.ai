"""Real LLM-driven code generation for Dev OS projects.

This module replaces the mock build pipeline with actual file generation. The
generated code is stored in MongoDB (`dev_code_files`) and is served as-is
for the live preview, exported to GitHub PRs, and deployed to Vercel/Netlify
via the existing real integrations.

Design notes:
- Each agent role generates a focused subset of files (Architect → schema +
  README; Frontend → index.html + app.js + styles.css with vanilla JS so the
  preview runs WITHOUT a build step; Backend → server.py FastAPI; QA →
  test_basic.py). This keeps the preview lightweight and deployable from a
  raw static host while still feeling like a "real" project.
- File contents come from the LLM with a strict "ONLY return file content,
  no markdown fences" prompt. We strip common LLM artefacts (fenced blocks,
  intro chatter) as a safety net.
- All file writes are atomic per path — re-running generation overwrites
  the same file IDs so the preview URL stays stable.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, List, Optional

from deps import db, new_id, now_iso

logger = logging.getLogger("teamnest")

# ── File specs per role ───────────────────────────────────────────────
# Each entry is (path, role, kind, prompt). The generated app is a fully
# *working* single-page SPA: login screen → main app, CRUD against a client-
# side "fake backend" backed by localStorage so the preview iframe actually
# works end-to-end without any server. The real FastAPI server.py is still
# generated for export — when the user hires the Dev Team / pushes to GitHub
# they get a production-ready backend with the same shape as the localStorage
# fake backend, so swapping is a one-liner.
#
# Demo credentials baked into the SPA (and surfaced on the login screen):
#   email: demo@example.com   password: demo
_FILE_SPECS: List[Dict[str, str]] = [
    {
        "path": "README.md",
        "role": "docs",
        "kind": "markdown",
        "prompt": (
            "Write a single-file README.md for a project described below. "
            "Include: 1-sentence elevator pitch, 5-bullet feature list, "
            "## Tech stack section (vanilla HTML/CSS/JS + FastAPI + SQLite), "
            "## Quick start (curl + open index.html), and ## Architecture "
            "overview. Add a clear ## Demo login section that calls out "
            "the hardcoded demo credentials (demo@example.com / demo) and "
            "explains that the preview uses an in-browser fake backend "
            "(localStorage) which gets swapped for the real FastAPI server "
            "in backend/server.py when deploying. Plain markdown, no code "
            "fences around the whole file."
        ),
    },
    {
        "path": "frontend/index.html",
        "role": "frontend",
        "kind": "html",
        "prompt": (
            "Write a single self-contained index.html for the product described "
            "below. This is a WORKING SPA with TWO views in the same file:\n\n"
            "1) <div id='login-view'> shown by default — centered login card "
            "with email + password inputs, a 'Sign in' button (id='login-btn'), "
            "a #login-error div, and a visible 'Demo: demo@example.com / demo' "
            "hint so visitors know what to type.\n"
            "2) <div id='app-view' hidden> — the actual product UI tailored "
            "to the brief. Include a top header with the product name, a sign-"
            "out button (id='logout-btn'), and a main work area with the "
            "product's core entity (e.g. invoices, vendors, tasks, leads, "
            "expenses — depending on the brief). The work area must have a "
            "form (id='create-form') to add a new entity (3-5 relevant "
            "fields), a table or list (id='entity-list') showing existing "
            "entities with at least 4 columns, and a small stats strip with "
            "2-3 KPIs (id='kpi-strip').\n\n"
            "Use Tailwind via CDN: "
            "<script src='https://cdn.tailwindcss.com'></script>. Also include "
            "<link rel='stylesheet' href='styles.css'> and "
            "<script defer src='app.js'></script>. Dark theme, modern "
            "typography. Use semantic ids — app.js will hook every "
            "interactive element by id. Views toggle ONLY via the [hidden] "
            "attribute — exactly one of #login-view/#app-view visible at a "
            "time. Layout must be fully responsive down to a 420px-wide "
            "pane (stack columns, wrap tables). NO markdown, NO explanation "
            "— return ONLY raw HTML starting with <!doctype html>."
        ),
    },
    {
        "path": "frontend/styles.css",
        "role": "designer",
        "kind": "css",
        "prompt": (
            "Write a styles.css file (~60-100 lines) that complements a "
            "Tailwind-CDN-based dark-theme SPA with a login screen and a "
            "main app dashboard. Include: custom CSS variables for brand "
            "colors, a subtle background gradient on body, smooth hover "
            "transitions on buttons & cards, a focus-ring on inputs, a "
            "subtle fade-in keyframe applied to .view-enter, and clean "
            "table styling for the entity list (borders, hover rows). "
            "CRITICAL: every input, textarea and select MUST explicitly set "
            "BOTH background-color and color together (e.g. dark input bg "
            "with light text, or light bg with dark text) so typed text is "
            "always readable — never let inputs inherit text color. "
            "NEVER set a display rule on #login-view or #app-view — their "
            "visibility is controlled solely by the [hidden] attribute. "
            "Avoid fixed widths over 100%; the layout must stay usable in "
            "a 420px-wide pane. "
            "Return ONLY raw CSS, no markdown."
        ),
    },
    {
        "path": "frontend/app.js",
        "role": "frontend",
        "kind": "javascript",
        "prompt": (
            "Write a vanilla JavaScript app.js (~140-220 lines) for the "
            "product described below. Must implement a FULLY WORKING SPA "
            "with the following behaviors:\n\n"
            "// === 1. Demo auth (client-side) ===\n"
            "// Hardcoded credentials: email='demo@example.com', "
            "password='demo'. Read inputs from #login-view, validate on "
            "click of #login-btn, on success hide #login-view, show "
            "#app-view, persist {email, loggedAt} to "
            "localStorage['app:auth']. On failure show msg in #login-error.\n"
            "// On page load, if localStorage['app:auth'] exists, skip "
            "straight to app-view.\n"
            "// #logout-btn clears localStorage['app:auth'] and reloads.\n\n"
            "// === 2. Working CRUD against localStorage 'fake backend' ===\n"
            "// localStorage key 'app:entities' stores an array. Implement:\n"
            "//   - api.list() — read array\n"
            "//   - api.create(obj) — push with id=crypto.randomUUID(), "
            "createdAt=new Date().toISOString()\n"
            "//   - api.remove(id) — filter out\n"
            "// On load, seed the array with 3-5 example entities relevant "
            "to the product brief if empty.\n"
            "// #create-form submission calls api.create, then re-renders.\n"
            "// renderList() repaints #entity-list as a <table> or <ul>.\n"
            "// renderKpis() updates #kpi-strip with computed totals (e.g. "
            "count, sum of an amount field, count of a status).\n\n"
            "// === 3. Wire it up on DOMContentLoaded ===\n"
            "// Add a small console.info banner: 'App ready · "
            "vanilla SPA · swap localStorage for backend/server.py to ship'.\n\n"
            "Return ONLY raw JavaScript — no markdown, no <script> tags, "
            "no HTML."
        ),
    },
    {
        "path": "backend/server.py",
        "role": "backend",
        "kind": "python",
        "prompt": (
            "Write a single-file FastAPI server.py for the product described "
            "below. This is the PRODUCTION backend that mirrors the "
            "client-side fake backend in frontend/app.js (entities CRUD + "
            "demo auth) — when users deploy, the SPA's `api` object swaps "
            "from localStorage to fetch('/api/...'). Endpoints:\n"
            "- POST /api/auth/login — MUST accept a JSON body via a Pydantic "
            "model named LoginReq with fields email:str + password:str "
            "(NOT OAuth2PasswordRequestForm / form-data, since the SPA "
            "POSTs JSON). Validate against hardcoded demo user "
            "(demo@example.com / demo) and return {token, user}. Use a "
            "uuid4().hex opaque token.\n"
            "- GET /api/auth/me reading Authorization: Bearer header, "
            "returning the logged-in user.\n"
            "- GET / POST / DELETE /api/entities — CRUD with the same shape "
            "the SPA expects: {id, createdAt, title, amount, ...}.\n"
            "- GET /api/health returning {status, version}.\n"
            "Use Pydantic v2 models. Add CORS middleware allow_origins=['*']. "
            "Store entities in an in-memory dict for now; comment-mark where "
            "a real DB would slot in. ~100-180 lines. Return ONLY raw Python, "
            "no markdown."
        ),
    },
    {
        "path": "backend/schema.sql",
        "role": "database",
        "kind": "sql",
        "prompt": (
            "Write a schema.sql for SQLite that backs the FastAPI server "
            "for the product below. Include a `users` table (id, email "
            "UNIQUE, password_hash, created_at), an `entities` table for "
            "the product's core entity with 4-6 relevant columns (no "
            "generic 'data' blob), timestamps (created_at, updated_at), "
            "FOREIGN KEY user_id → users(id), and one CREATE INDEX on "
            "the most-queried column. Add INSERT seed: demo user "
            "(demo@example.com) + 3 example entities. Return ONLY raw SQL, "
            "no markdown."
        ),
    },
    {
        "path": "tests/test_basic.py",
        "role": "qa",
        "kind": "python",
        "prompt": (
            "Write a pytest test file (~50-90 lines) with 6 test functions "
            "for the FastAPI server described below: 1) /api/health 200 + "
            "'status'. 2) /api/auth/login with demo creds returns 200 + "
            "token. 3) /api/auth/login with wrong creds → 401. 4) GET "
            "/api/entities returns 200 + list. 5) POST /api/entities with "
            "valid body → 200, GET shows the new item. 6) DELETE removes "
            "an item. Use FastAPI TestClient. Return ONLY raw Python."
        ),
    },
]


def _strip_llm_artefacts(text: str, kind: str) -> str:
    """Remove markdown fences / preamble that LLMs sometimes wrap content in."""
    if not text:
        return ""
    t = text.strip()
    # ```lang ... ``` → ...
    fenced = re.match(r"^```[a-zA-Z]*\n(.*)\n```\s*$", t, re.DOTALL)
    if fenced:
        t = fenced.group(1).strip()
    # Drop a leading "Here is the ..." chatty intro if the next line looks like code.
    if not t.startswith(("#", "<", "import", "from", "/*", "*", "--", "{", "(", "CREATE", "INSERT", "function", "const", "let", ":root")):
        # heuristic — take everything from the first plausible code start
        for marker in ("<!doctype", "<!DOCTYPE", "<html", "import ", "from ", "CREATE", "INSERT", "function ", "const ", "let ", ":root", "/*", "*", "# "):
            idx = t.find(marker)
            if idx > 0:
                t = t[idx:]
                break
    return t.strip() + "\n"


async def _llm_generate(
    prompt: str, brief: str, image_bytes_list: Optional[List[bytes]] = None,
) -> str:
    """One-shot LLM call returning raw text. Falls back to empty string on
    error (caller substitutes a stub)."""
    try:
        from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return ""
        chat = (
            LlmChat(
                api_key=key,
                session_id=f"codegen-{new_id()[:8]}",
                system_message=(
                    "You are a senior staff engineer. Return ONLY the raw file "
                    "contents — no markdown fences, no explanations. The file "
                    "must be runnable / valid as-is."
                ),
            )
            .with_model("openai", "gpt-5.4-mini")
        )
        msg = f"Product brief:\n{brief}\n\nTask:\n{prompt}"
        file_contents = None
        if image_bytes_list:
            import base64
            file_contents = [
                ImageContent(image_base64=base64.b64encode(b).decode("utf-8"))
                for b in image_bytes_list[:3]
            ]
            msg += (
                "\n\nNOTE: The user attached screenshot(s)/image(s) as a design "
                "and content reference — match layout, fields and copy to them "
                "where relevant."
            )
        resp = await chat.send_message(UserMessage(text=msg, file_contents=file_contents))
        return resp or ""
    except Exception as e:
        logger.warning("[codegen] LLM call failed: %s", e)
        return ""


def _stub_for(spec: Dict[str, str], project_name: str) -> str:
    """Stable, useful fallback when the LLM fails or has no key.

    The stub renders a fully working vanilla-JS SPA: login screen with
    hardcoded demo credentials, a localStorage-backed entities CRUD with
    seed data, and matching backend/server.py + schema.sql so the export
    is real even when the LLM is unavailable. Demo creds: demo@example.com
    / demo."""
    p = spec["path"]
    n = project_name
    n_safe = n.replace("'", "\\'")
    if p == "README.md":
        return (
            f"# {n}\n\n"
            f"AI-generated working prototype for **{n}**.\n\n"
            "## Features\n"
            "- Working login (demo credentials)\n"
            "- CRUD over the product's core entity\n"
            "- Live KPI strip\n"
            "- Real FastAPI backend ready for deploy\n"
            "- SQLite schema for persistence\n\n"
            "## Tech stack\n"
            "- Vanilla HTML/CSS/JS frontend (no build step)\n"
            "- FastAPI backend (`backend/server.py`)\n"
            "- SQLite schema (`backend/schema.sql`)\n\n"
            "## Demo login\n"
            "Use **`demo@example.com`** / **`demo`** to sign in.\n\n"
            "The preview iframe uses an in-browser fake backend "
            "(`localStorage`) so the SPA works end-to-end without a server. "
            "When you deploy, swap the `api` object in `frontend/app.js` "
            "to `fetch('/api/...')` calls against `backend/server.py` — "
            "the shapes already match.\n\n"
            "## Quick start\n"
            "```bash\n"
            "# Preview the SPA only\n"
            "python -m http.server -d frontend 8000\n"
            "# Run the production backend\n"
            "pip install fastapi uvicorn pydantic\n"
            "uvicorn backend.server:app --reload\n"
            "```\n"
        )
    if p == "frontend/index.html":
        return (
            "<!doctype html>\n<html lang='en'>\n<head>\n"
            "  <meta charset='utf-8'>\n"
            "  <meta name='viewport' content='width=device-width,initial-scale=1'>\n"
            f"  <title>{n}</title>\n"
            "  <script src='https://cdn.tailwindcss.com'></script>\n"
            "  <link rel='stylesheet' href='styles.css'>\n"
            "  <script defer src='app.js'></script>\n"
            "</head>\n"
            "<body class='bg-zinc-950 text-zinc-100 min-h-screen'>\n"
            "  <!-- Login view (default) -->\n"
            "  <section id='login-view' class='min-h-screen flex items-center justify-center px-4 view-enter'>\n"
            "    <div class='w-full max-w-sm bg-zinc-900/80 rounded-2xl ring-1 ring-white/10 p-6 shadow-xl'>\n"
            f"      <h1 class='text-2xl font-bold mb-1'>{n}</h1>\n"
            "      <p class='text-zinc-400 text-sm mb-5'>Sign in to continue</p>\n"
            "      <label class='block text-xs text-zinc-400 mb-1'>Email</label>\n"
            "      <input id='login-email' type='email' value='demo@example.com'\n"
            "             class='w-full mb-3 bg-zinc-950 ring-1 ring-white/10 rounded-lg px-3 py-2 text-sm focus:ring-amber-400 outline-none'>\n"
            "      <label class='block text-xs text-zinc-400 mb-1'>Password</label>\n"
            "      <input id='login-password' type='password' value='demo'\n"
            "             class='w-full mb-3 bg-zinc-950 ring-1 ring-white/10 rounded-lg px-3 py-2 text-sm focus:ring-amber-400 outline-none'>\n"
            "      <div id='login-error' class='text-red-400 text-xs mb-3 hidden'></div>\n"
            "      <button id='login-btn'\n"
            "              class='w-full bg-amber-300 hover:bg-amber-200 text-black font-semibold rounded-lg py-2 text-sm'>Sign in</button>\n"
            "      <p class='text-[11px] text-zinc-500 mt-4 text-center'>\n"
            "        Demo: <code class='text-amber-300'>demo@example.com</code> / <code class='text-amber-300'>demo</code>\n"
            "      </p>\n"
            "    </div>\n"
            "  </section>\n\n"
            "  <!-- App view (hidden until login) -->\n"
            "  <section id='app-view' hidden class='view-enter'>\n"
            "    <header class='border-b border-white/10 px-6 py-3 flex items-center justify-between bg-zinc-950/80'>\n"
            f"      <div class='font-semibold'>{n}</div>\n"
            "      <button id='logout-btn' class='text-xs text-zinc-400 hover:text-zinc-100'>Sign out</button>\n"
            "    </header>\n"
            "    <main class='max-w-5xl mx-auto px-6 py-8 space-y-6'>\n"
            "      <div id='kpi-strip' class='grid grid-cols-3 gap-3'></div>\n"
            "      <form id='create-form' class='bg-zinc-900/60 rounded-2xl ring-1 ring-white/10 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3'>\n"
            "        <input name='title' placeholder='Title' required class='bg-zinc-950 ring-1 ring-white/10 rounded-lg px-3 py-2 text-sm sm:col-span-2'>\n"
            "        <input name='amount' type='number' step='0.01' placeholder='Amount' class='bg-zinc-950 ring-1 ring-white/10 rounded-lg px-3 py-2 text-sm'>\n"
            "        <button type='submit' class='bg-amber-300 hover:bg-amber-200 text-black font-semibold rounded-lg px-3 py-2 text-sm'>Add</button>\n"
            "      </form>\n"
            "      <div id='entity-list' class='bg-zinc-900/60 rounded-2xl ring-1 ring-white/10 overflow-hidden'></div>\n"
            "    </main>\n"
            "  </section>\n"
            "</body>\n</html>\n"
        )
    if p == "frontend/styles.css":
        return (
            ":root{--brand:#fbbf24;--brand-soft:#fde68a}\n"
            "body{background:radial-gradient(1200px 600px at 20% -10%,rgba(251,191,36,.08),transparent 60%),#09090b;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}\n"
            "button{transition:transform .15s ease,background-color .2s ease}\n"
            "button:hover{transform:translateY(-1px)}\n"
            "input:focus{outline:none;box-shadow:0 0 0 2px rgba(251,191,36,.35)}\n"
            ".view-enter{animation:fadeIn .25s ease-out both}\n"
            "@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}\n"
            "table{width:100%;border-collapse:collapse}\n"
            "th,td{padding:.6rem .9rem;font-size:.825rem;text-align:left}\n"
            "thead th{background:rgba(255,255,255,.04);color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em;font-size:.65rem}\n"
            "tbody tr{border-top:1px solid rgba(255,255,255,.04)}\n"
            "tbody tr:hover{background:rgba(255,255,255,.02)}\n"
            ".kpi{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:1rem;padding:1rem}\n"
            ".kpi .label{font-size:.65rem;text-transform:uppercase;letter-spacing:.06em;color:#a1a1aa}\n"
            ".kpi .value{font-size:1.5rem;font-weight:700;margin-top:.25rem}\n"
        )
    if p == "frontend/app.js":
        # NOTE: keep this string in sync with index.html's element ids.
        return (
            f"// {n_safe} — vanilla SPA · demo creds: demo@example.com / demo\n"
            "// Swap the `api` object for fetch() calls when shipping to "
            "production with backend/server.py.\n\n"
            "const DEMO = { email: 'demo@example.com', password: 'demo' };\n"
            "const AUTH_KEY = 'app:auth';\n"
            "const ENT_KEY = 'app:entities';\n\n"
            "// === Fake backend (localStorage) ===\n"
            "const api = {\n"
            "  list() { try { return JSON.parse(localStorage.getItem(ENT_KEY)) || []; } catch { return []; } },\n"
            "  _save(arr) { localStorage.setItem(ENT_KEY, JSON.stringify(arr)); },\n"
            "  create(obj) {\n"
            "    const arr = api.list();\n"
            "    const row = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...obj };\n"
            "    arr.unshift(row); api._save(arr); return row;\n"
            "  },\n"
            "  remove(id) {\n"
            "    const arr = api.list().filter(r => r.id !== id);\n"
            "    api._save(arr);\n"
            "  },\n"
            "};\n\n"
            "function seedIfEmpty() {\n"
            "  if (api.list().length) return;\n"
            "  ['First item', 'Second item', 'Third item'].forEach((t, i) => api.create({ title: t, amount: (i + 1) * 100 }));\n"
            "}\n\n"
            "function showView(which) {\n"
            "  document.getElementById('login-view').hidden = which !== 'login';\n"
            "  document.getElementById('app-view').hidden = which !== 'app';\n"
            "}\n\n"
            "function loginSubmit() {\n"
            "  const email = document.getElementById('login-email').value.trim();\n"
            "  const pwd = document.getElementById('login-password').value;\n"
            "  const errEl = document.getElementById('login-error');\n"
            "  if (email === DEMO.email && pwd === DEMO.password) {\n"
            "    localStorage.setItem(AUTH_KEY, JSON.stringify({ email, loggedAt: new Date().toISOString() }));\n"
            "    errEl.classList.add('hidden');\n"
            "    enterApp();\n"
            "  } else {\n"
            "    errEl.textContent = 'Wrong email or password. Try demo@example.com / demo.';\n"
            "    errEl.classList.remove('hidden');\n"
            "  }\n"
            "}\n\n"
            "function enterApp() {\n"
            "  showView('app');\n"
            "  seedIfEmpty();\n"
            "  render();\n"
            "}\n\n"
            "function logout() {\n"
            "  localStorage.removeItem(AUTH_KEY);\n"
            "  location.reload();\n"
            "}\n\n"
            "function render() {\n"
            "  const rows = api.list();\n"
            "  const list = document.getElementById('entity-list');\n"
            "  list.innerHTML = rows.length === 0\n"
            "    ? '<div class=\"p-8 text-center text-zinc-500 text-sm\">No items yet — add one above.</div>'\n"
            "    : '<table><thead><tr><th>Title</th><th>Amount</th><th>Created</th><th></th></tr></thead><tbody>' +\n"
            "      rows.map(r => `<tr><td>${escape(r.title || '')}</td><td>${r.amount ?? ''}</td><td>${new Date(r.createdAt).toLocaleString()}</td><td><button data-id='${r.id}' class='text-xs text-red-400 hover:text-red-300 remove-btn'>Remove</button></td></tr>`).join('') +\n"
            "      '</tbody></table>';\n"
            "  list.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => { api.remove(btn.dataset.id); render(); }));\n"
            "  renderKpis(rows);\n"
            "}\n\n"
            "function renderKpis(rows) {\n"
            "  const sum = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);\n"
            "  const newest = rows[0]?.createdAt ? new Date(rows[0].createdAt).toLocaleDateString() : '—';\n"
            "  document.getElementById('kpi-strip').innerHTML =\n"
            "    `<div class='kpi'><div class='label'>Total items</div><div class='value'>${rows.length}</div></div>` +\n"
            "    `<div class='kpi'><div class='label'>Sum of amounts</div><div class='value'>${sum.toLocaleString()}</div></div>` +\n"
            "    `<div class='kpi'><div class='label'>Last added</div><div class='value'>${newest}</div></div>`;\n"
            "}\n\n"
            "function escape(s) { return String(s).replace(/[&<>'\"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\\'':'&#39;','\"':'&quot;' }[c])); }\n\n"
            "document.addEventListener('DOMContentLoaded', () => {\n"
            f"  console.info('{n_safe} ready · vanilla SPA · swap localStorage for backend/server.py to ship');\n"
            "  if (localStorage.getItem(AUTH_KEY)) { enterApp(); return; }\n"
            "  showView('login');\n"
            "  document.getElementById('login-btn').addEventListener('click', loginSubmit);\n"
            "  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') loginSubmit(); });\n"
            "  document.getElementById('logout-btn').addEventListener('click', logout);\n"
            "  document.getElementById('create-form').addEventListener('submit', e => {\n"
            "    e.preventDefault();\n"
            "    const fd = new FormData(e.target);\n"
            "    const obj = Object.fromEntries(fd.entries());\n"
            "    if (obj.amount !== '' && obj.amount != null) obj.amount = Number(obj.amount);\n"
            "    api.create(obj); e.target.reset(); render();\n"
            "  });\n"
            "});\n"
        )
    if p == "backend/server.py":
        return (
            "\"\"\"Production FastAPI for the SPA. Mirrors the shape of the\n"
            "client-side fake backend in frontend/app.js — swap localStorage\n"
            "for fetch() calls against this server to go live.\"\"\"\n"
            "from datetime import datetime, timezone\n"
            "from uuid import uuid4\n"
            "from typing import Optional\n\n"
            "from fastapi import FastAPI, HTTPException, Header\n"
            "from fastapi.middleware.cors import CORSMiddleware\n"
            "from pydantic import BaseModel\n\n"
            f"app = FastAPI(title='{n_safe}')\n"
            "app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])\n\n"
            "# === Demo auth — replace with a real auth provider before launch ===\n"
            "DEMO_EMAIL = 'demo@example.com'\n"
            "DEMO_PASSWORD = 'demo'\n"
            "ACTIVE_TOKENS: dict[str, str] = {}  # token -> email\n\n"
            "class LoginReq(BaseModel):\n"
            "    email: str\n"
            "    password: str\n\n"
            "class EntityIn(BaseModel):\n"
            "    title: str\n"
            "    amount: Optional[float] = None\n\n"
            "ENTITIES: list[dict] = []  # in-memory; swap for SQL in production\n\n"
            "def now() -> str:\n"
            "    return datetime.now(timezone.utc).isoformat()\n\n"
            "def require_user(authorization: Optional[str] = Header(None)) -> str:\n"
            "    if not authorization or not authorization.startswith('Bearer '):\n"
            "        raise HTTPException(401, 'Missing token')\n"
            "    tok = authorization.split(' ', 1)[1]\n"
            "    email = ACTIVE_TOKENS.get(tok)\n"
            "    if not email:\n"
            "        raise HTTPException(401, 'Invalid token')\n"
            "    return email\n\n"
            "@app.get('/api/health')\n"
            "def health():\n"
            "    return {'status': 'ok', 'version': '0.1.0'}\n\n"
            "@app.post('/api/auth/login')\n"
            "def login(req: LoginReq):\n"
            "    if req.email != DEMO_EMAIL or req.password != DEMO_PASSWORD:\n"
            "        raise HTTPException(401, 'Wrong email or password')\n"
            "    token = uuid4().hex\n"
            "    ACTIVE_TOKENS[token] = req.email\n"
            "    return {'token': token, 'user': {'email': req.email}}\n\n"
            "@app.get('/api/auth/me')\n"
            "def me(authorization: Optional[str] = Header(None)):\n"
            "    return {'email': require_user(authorization)}\n\n"
            "@app.get('/api/entities')\n"
            "def list_entities(authorization: Optional[str] = Header(None)):\n"
            "    require_user(authorization)\n"
            "    return ENTITIES\n\n"
            "@app.post('/api/entities')\n"
            "def create_entity(body: EntityIn, authorization: Optional[str] = Header(None)):\n"
            "    require_user(authorization)\n"
            "    row = {'id': uuid4().hex, 'createdAt': now(), **body.model_dump()}\n"
            "    ENTITIES.insert(0, row)\n"
            "    return row\n\n"
            "@app.delete('/api/entities/{eid}')\n"
            "def delete_entity(eid: str, authorization: Optional[str] = Header(None)):\n"
            "    require_user(authorization)\n"
            "    before = len(ENTITIES)\n"
            "    ENTITIES[:] = [e for e in ENTITIES if e['id'] != eid]\n"
            "    if len(ENTITIES) == before:\n"
            "        raise HTTPException(404, 'Not found')\n"
            "    return {'ok': True}\n"
        )
    if p == "backend/schema.sql":
        return (
            f"-- {n_safe} schema\n"
            "CREATE TABLE users (\n"
            "  id INTEGER PRIMARY KEY,\n"
            "  email TEXT UNIQUE NOT NULL,\n"
            "  password_hash TEXT NOT NULL,\n"
            "  created_at TEXT NOT NULL\n"
            ");\n"
            "CREATE TABLE entities (\n"
            "  id TEXT PRIMARY KEY,\n"
            "  user_id INTEGER NOT NULL REFERENCES users(id),\n"
            "  title TEXT NOT NULL,\n"
            "  amount REAL,\n"
            "  status TEXT DEFAULT 'open',\n"
            "  created_at TEXT NOT NULL,\n"
            "  updated_at TEXT NOT NULL\n"
            ");\n"
            "CREATE INDEX idx_entities_user ON entities(user_id);\n"
            "INSERT INTO users (id, email, password_hash, created_at)\n"
            "  VALUES (1, 'demo@example.com', '$2b$replace_with_real_hash', '2026-01-01T00:00:00Z');\n"
            "INSERT INTO entities (id, user_id, title, amount, created_at, updated_at) VALUES\n"
            "  ('seed-1', 1, 'First item',  100.00, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),\n"
            "  ('seed-2', 1, 'Second item', 200.00, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),\n"
            "  ('seed-3', 1, 'Third item',  300.00, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');\n"
        )
    if p == "tests/test_basic.py":
        return (
            "from fastapi.testclient import TestClient\n"
            "from backend.server import app\n\n"
            "c = TestClient(app)\n\n"
            "def _login():\n"
            "    r = c.post('/api/auth/login', json={'email':'demo@example.com','password':'demo'})\n"
            "    return r.json()['token']\n\n"
            "def test_health():\n"
            "    r = c.get('/api/health'); assert r.status_code == 200 and 'status' in r.json()\n\n"
            "def test_login_ok():\n"
            "    r = c.post('/api/auth/login', json={'email':'demo@example.com','password':'demo'})\n"
            "    assert r.status_code == 200 and 'token' in r.json()\n\n"
            "def test_login_bad():\n"
            "    r = c.post('/api/auth/login', json={'email':'x','password':'y'})\n"
            "    assert r.status_code == 401\n\n"
            "def test_entities_list():\n"
            "    h = {'Authorization': f'Bearer {_login()}'}\n"
            "    r = c.get('/api/entities', headers=h); assert r.status_code == 200 and isinstance(r.json(), list)\n\n"
            "def test_entities_create():\n"
            "    h = {'Authorization': f'Bearer {_login()}'}\n"
            "    r = c.post('/api/entities', json={'title':'x','amount':10}, headers=h)\n"
            "    assert r.status_code == 200 and r.json()['title'] == 'x'\n\n"
            "def test_entities_delete():\n"
            "    h = {'Authorization': f'Bearer {_login()}'}\n"
            "    new_row = c.post('/api/entities', json={'title':'rm','amount':1}, headers=h).json()\n"
            "    r = c.delete(f\"/api/entities/{new_row['id']}\", headers=h)\n"
            "    assert r.status_code == 200\n"
        )
    return f"# {p}\n# (scaffold for {n})\n"


async def seed_stub_files(project: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Synchronously seed every spec'd path with its stub fallback so the
    live preview iframe renders a usable SPA the very moment a project is
    created. No LLM calls — safe to fire from request handlers. Idempotent:
    won't overwrite files that already exist (so it never clobbers a real
    LLM build)."""
    project_id = project["id"]
    workspace_id = project["workspace_id"]
    project_name = project.get("name") or "Untitled"
    out: List[Dict[str, Any]] = []
    for spec in _FILE_SPECS:
        existing = await db.dev_code_files.find_one(
            {"project_id": project_id, "path": spec["path"]}, {"_id": 0, "id": 1},
        )
        if existing:
            continue
        content = _stub_for(spec, project_name)
        doc = {
            "id": new_id(),
            "workspace_id": workspace_id,
            "project_id": project_id,
            "path": spec["path"],
            "kind": spec["kind"],
            "role": spec["role"],
            "content": content,
            "size_bytes": len(content.encode("utf-8")),
            "llm_status": "stub",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.dev_code_files.insert_one(doc.copy())
        out.append(doc)
    return out


async def generate_project_files(
    project: Dict[str, Any],
    brief: Optional[str] = None,
    on_progress: Optional[Any] = None,
    image_bytes_list: Optional[List[bytes]] = None,
) -> List[Dict[str, Any]]:
    """Generate all spec'd files for a project, store them in `dev_code_files`.

    Idempotent — re-running overwrites files at the same paths so the
    preview URL never breaks and exports stay consistent. Calls `on_progress`
    with `(index, total, path)` after each file lands (used by the build
    pipeline to update timeline entries in real-time)."""
    project_id = project["id"]
    workspace_id = project["workspace_id"]
    project_name = project.get("name") or "Untitled"
    brief = (
        brief
        or (project.get("plan") or {}).get("product_brief")
        or project.get("description")
        or project_name
    )

    # Reference-website grounding for fresh builds ("use current website",
    # or a URL/domain in the brief or project name).
    try:
        from services.dev_site_import import site_context_for, wants_site_import
        blob = f"{brief} {project_name} {project.get('description') or ''}"
        if wants_site_import(blob):
            ctx = await site_context_for(blob)
            if ctx:
                brief = f"{brief}\n\n{ctx}"
    except Exception:
        pass

    out: List[Dict[str, Any]] = []
    total = len(_FILE_SPECS)
    for i, spec in enumerate(_FILE_SPECS):
        # Attached screenshots only inform the visual frontend files.
        spec_images = image_bytes_list if spec["path"].startswith("frontend/") else None
        raw = await _llm_generate(spec["prompt"], brief, image_bytes_list=spec_images)
        content = _strip_llm_artefacts(raw, spec["kind"]) if raw else ""
        if not content or len(content) < 20:
            content = _stub_for(spec, project_name)
            llm_status = "stub"
        else:
            llm_status = "real"

        existing = await db.dev_code_files.find_one(
            {"project_id": project_id, "path": spec["path"]}, {"_id": 0, "id": 1},
        )
        file_id = existing["id"] if existing else new_id()
        doc = {
            "id": file_id,
            "workspace_id": workspace_id,
            "project_id": project_id,
            "path": spec["path"],
            "kind": spec["kind"],
            "role": spec["role"],
            "content": content,
            "size_bytes": len(content.encode("utf-8")),
            "llm_status": llm_status,
            "updated_at": now_iso(),
        }
        if existing:
            await db.dev_code_files.update_one({"id": file_id}, {"$set": doc})
        else:
            doc["created_at"] = now_iso()
            await db.dev_code_files.insert_one(doc.copy())

        out.append(doc)
        if on_progress:
            try:
                await on_progress(i + 1, total, spec["path"])
            except Exception:
                pass

    return out


# Convenience: lookup helpers used by the file-tree + preview endpoints.
async def list_project_files(project_id: str) -> List[Dict[str, Any]]:
    return await db.dev_code_files.find(
        {"project_id": project_id}, {"_id": 0},
    ).sort("path", 1).to_list(500)


async def get_file_by_path(project_id: str, path: str) -> Optional[Dict[str, Any]]:
    return await db.dev_code_files.find_one(
        {"project_id": project_id, "path": path}, {"_id": 0},
    )


async def get_file_by_id(file_id: str) -> Optional[Dict[str, Any]]:
    return await db.dev_code_files.find_one({"id": file_id}, {"_id": 0})


# ─── Talk-to-your-build ──────────────────────────────────────────────
# Given a natural-language instruction ("make the hero gradient red"),
# pick the best file(s) to edit, ask the LLM to rewrite them, and persist
# the change. Closes the chat ↔ code ↔ preview loop in one call.

import json as _json


# ─── Feature-preservation guard for talk_to_build ────────────────────────
# The LLM rewrites whole files; when it silently drops existing features
# (ids, handlers, functions) we catch it here and force a corrected retry.
_FP_HTML_ID_RE = re.compile(r'id="([\w-]+)"')
_FP_JS_SEL_RE = re.compile(
    r"getElementById\(['\"]([\w-]+)['\"]\)|querySelector\(['\"]#([\w-]+)['\"]\)|\$\(['\"]#([\w-]+)['\"]\)"
)
_FP_JS_FN_RE = re.compile(r"function\s+([A-Za-z_]\w*)|const\s+([A-Za-z_]\w*)\s*=\s*(?:async\b|\(|function\b)")
_FP_REMOVAL_WORDS = (
    "remove", "delete", "drop ", "get rid", "strip", "rebuild", "start over",
    "rewrite", "replace the whole", "from scratch", "simplify the page",
)


def _feature_markers(path: str, content: str) -> set:
    if path.endswith(".html"):
        return set(_FP_HTML_ID_RE.findall(content or ""))
    if path.endswith(".js"):
        out = set()
        for m in _FP_JS_SEL_RE.finditer(content or ""):
            out.add(next(g for g in m.groups() if g))
        for m in _FP_JS_FN_RE.finditer(content or ""):
            out.add(next(g for g in m.groups() if g))
        return out
    return set()


def _preservation_violations(path: str, old: str, new: str, instruction: str) -> List[str]:
    """Return the list of dropped feature markers that look accidental."""
    low = (instruction or "").lower()
    if any(w in low for w in _FP_REMOVAL_WORDS):
        return []
    old_m = _feature_markers(path, old)
    if not old_m:
        return []
    dropped = sorted(old_m - _feature_markers(path, new))
    shrunk = len(new) < len(old) * 0.55
    big_drop = len(dropped) > max(2, int(len(old_m) * 0.25))
    if shrunk or big_drop:
        return dropped or ["<file shrank by more than 45%>"]
    return []


async def talk_to_build(
    project: Dict[str, Any],
    instruction: str,
    role_key: Optional[str] = None,
    on_step: Optional[Any] = None,
    image_bytes_list: Optional[List[bytes]] = None,
) -> Dict[str, Any]:
    """Apply a natural-language edit to one or more files in this project.

    Strategy:
      1. Load the current file tree + content.
      2. Ask the LLM to return JSON `{files: [{path, content}], summary}`
         containing the FULL new content for ANY files it wants to change
         (limit 3 — keeps latency + cost predictable).
      3. Validate, persist, return a change report.

    If `role_key` is provided (the human collaborator claimed a role like
    "frontend" / "backend" / "qa"), we prepend that role's specialist system
    prompt so the AI biases its edit toward their concerns — a Frontend Dev's
    "make it modern" yields UI tweaks, a Backend Dev's same prompt yields API
    changes, etc.

    Falls back to an empty result if the LLM call fails — caller surfaces
    a friendly error to the chat input.
    """
    files = await list_project_files(project["id"])
    if not files:
        return {"ok": False, "reason": "no_files", "summary": "No files yet — run a build first."}

    async def _emit(label: str, icon: str = "⚙️") -> None:
        if on_step:
            try:
                await on_step(label, icon)
            except Exception:
                pass

    await _emit(f"Read {len(files)} project files", "📖")

    # Role-bias for collaborative work — pulled from dev_chat_agents.ROLES so
    # we don't drift from the role catalog the rest of the app uses. We
    # silently drop unknown / non-claimable role keys (e.g. typos, or the
    # coordinator `devmgr`) to avoid biasing on noise.
    role_bias = ""
    if role_key and role_key != "devmgr":
        try:
            from services.dev_chat_agents import ROLES
            role = ROLES.get(role_key)
            if role:
                role_bias = (
                    f"\n\nThe human asking for this change is acting as the "
                    f"{role['label']} on the team. Bias your edit to that "
                    f"perspective: {role.get('system_prompt', '').strip()}\n"
                )
        except Exception:
            role_bias = ""

    # Compact context for the prompt: path + content per file. The cap is
    # generous (24KB) — truncating files used to make the LLM regenerate
    # from a partial view and silently drop the truncated features.
    catalog = []
    for f in files:
        content = (f.get("content") or "")[:24000]
        catalog.append(f"### {f['path']}\n```\n{content}\n```")
    catalog_text = "\n\n".join(catalog)

    # Reference-website grounding: "use current website" / URL in instruction.
    site_block = ""
    try:
        from services.dev_site_import import site_context_for, wants_site_import
        if wants_site_import(instruction):
            ctx = await site_context_for(instruction, project.get("name"), project.get("description"))
            if ctx:
                await _emit("Imported reference website content", "🌐")
                site_block = f"\n\n{ctx}\n"
    except Exception:
        site_block = ""

    prompt = (
        "You are a senior engineer editing this multi-file project. The user "
        "wants the following change applied:\n\n"
        f"USER REQUEST: {instruction}\n\n"
        f"{role_bias}"
        "Below is the current file tree with full content. Return ONLY valid "
        "JSON of the shape "
        "`{\"files\":[{\"path\":\"...\",\"content\":\"...\"}, ...], \"summary\":\"...\"}` "
        "where each file you want to change has its NEW FULL content (not a "
        "diff). Touch ≤4 files (frontend pair + backend pair if syncing "
        "data shape, otherwise just 1). Keep changes minimal and focused "
        "on the user's request. Do NOT add new files unless absolutely "
        "required by the request. The 'summary' is a 1-sentence human "
        "description of what you changed.\n\n"
        "FRONTEND ↔ BACKEND SYNC RULE (this is critical):\n"
        "The SPA in `frontend/app.js` uses an `api` object backed by "
        "localStorage; the real production server in `backend/server.py` "
        "must expose the SAME shape so the SPA's only change at deploy time "
        "is swapping localStorage for fetch(). Therefore:\n"
        "• If the user adds/removes/renames an entity field (e.g. 'add a "
        "status column', 'rename amount to total'), you MUST update BOTH "
        "`frontend/app.js` (the form inputs, render columns, KPIs that "
        "reference the field) AND `backend/server.py` (the Pydantic "
        "`EntityIn` / response models and any in-memory shape). When "
        "schema.sql also exists, prefer to update it too if the field "
        "would clearly require a column.\n"
        "• If the user adds/removes/changes an endpoint (e.g. 'add a PATCH "
        "/api/entities/:id'), you MUST update `backend/server.py` (the "
        "route) AND `frontend/app.js` (the corresponding method on the "
        "`api` object so the SPA can call it). Don't ship one without the "
        "other.\n"
        "• If the user changes auth (e.g. 'require name not just email'), "
        "update BOTH the login UI in `frontend/index.html` + the client "
        "validation in `frontend/app.js` AND the `LoginReq` model + handler "
        "in `backend/server.py`.\n"
        "• Pure-cosmetic edits (colors, copy, layout, icon swaps) that "
        "don't touch data shape are fine to ship in one file.\n\n"
        "HTML ↔ JS ID CONTRACT (violating this breaks the app):\n"
        "`frontend/index.html` and `frontend/app.js` are a strict contract: "
        "every element id that app.js queries ('#entities-list', "
        "'#create-form', '#login-email', filters, etc.) MUST exist in "
        "index.html, and vice versa. If you rewrite or redesign "
        "index.html you MUST keep every id app.js references (or return an "
        "updated app.js in the same edit). NEVER return a redesigned "
        "index.html that drops sections app.js renders into — redesign "
        "means restyling the SAME structural elements, not removing them. "
        "Views toggle only via the [hidden] attribute.\n\n"
        "FEATURE PRESERVATION CONTRACT (violating this destroys user work):\n"
        "The file contents below are COMPLETE. Any file you return must also "
        "be COMPLETE — carry over every existing feature, section, element "
        "id, event handler and function that the user did not explicitly ask "
        "to remove. Never respond with a shortened or simplified version of "
        "a file; if a file is long, that's fine — return all of it with only "
        "the requested change applied.\n"
        f"{site_block}\n"
        f"=== CURRENT FILES ===\n{catalog_text}\n=== END FILES ===\n\n"
        "Respond with ONLY the JSON. No markdown fences, no explanation."
    )

    try:
        from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return {"ok": False, "reason": "no_llm_key", "summary": "AI key missing"}
        await _emit("Working out the edit plan…", "🧠")
        chat = (
            LlmChat(
                api_key=key,
                session_id=f"talk-{new_id()[:8]}",
                system_message=(
                    "You are a senior staff engineer making minimal, focused "
                    "code edits. Always respond with valid JSON only."
                ),
            )
            .with_model("openai", "gpt-5.4-mini")
        )
        file_contents = None
        if image_bytes_list:
            import base64
            file_contents = [
                ImageContent(image_base64=base64.b64encode(b).decode("utf-8"))
                for b in image_bytes_list[:3]
            ]
            prompt += (
                "\n\nNOTE: The user attached screenshot(s)/image(s) as visual "
                "reference — match your edit to what they show."
            )
        raw = await chat.send_message(UserMessage(text=prompt, file_contents=file_contents))
    except Exception as e:
        logger.warning("[talk-build] LLM call failed: %s", e)
        return {"ok": False, "reason": "llm_error", "summary": f"AI error: {e}"}

    # Strip code fences if the LLM disobeyed instructions.
    cleaned = (raw or "").strip()
    if cleaned.startswith("```"):
        m = re.match(r"^```[a-zA-Z]*\n(.*)\n```\s*$", cleaned, re.DOTALL)
        if m:
            cleaned = m.group(1).strip()

    try:
        payload = _json.loads(cleaned)
    except _json.JSONDecodeError:
        logger.warning("[talk-build] bad JSON from LLM: %s", cleaned[:300])
        return {
            "ok": False,
            "reason": "bad_response",
            "summary": "AI response wasn't valid JSON",
            "raw": cleaned[:1000],
        }

    edits = payload.get("files") or []
    if not isinstance(edits, list) or not edits:
        return {"ok": True, "summary": payload.get("summary") or "No changes were needed.", "files_changed": []}

    # ── Feature-preservation guard: detect accidental feature drops and
    # force ONE corrected retry before persisting anything. ──
    old_by_path = {f["path"]: (f.get("content") or "") for f in files}

    def _find_violations(edit_list):
        out = {}
        for e in edit_list[:4]:
            p, c = e.get("path"), e.get("content")
            if not p or not isinstance(c, str) or p not in old_by_path:
                continue
            v = _preservation_violations(p, old_by_path[p], c, instruction)
            if v:
                out[p] = v
        return out

    violations = _find_violations(edits)
    if violations:
        await _emit("Detected dropped features — asking for a corrected edit", "🛡️")
        detail = "; ".join(
            f"{p} lost: {', '.join(v[:10])}" for p, v in violations.items()
        )
        try:
            retry_raw = await chat.send_message(UserMessage(text=(
                "Your previous edit accidentally REMOVED existing features. "
                f"Specifically — {detail}. Re-send the SAME JSON shape with "
                "the COMPLETE corrected file contents: apply the user's "
                "requested change but keep every existing id, handler, "
                "function and section listed above. JSON only."
            )))
            retry_clean = (retry_raw or "").strip()
            if retry_clean.startswith("```"):
                m = re.match(r"^```[a-zA-Z]*\n(.*)\n```\s*$", retry_clean, re.DOTALL)
                if m:
                    retry_clean = m.group(1).strip()
            retry_payload = _json.loads(retry_clean)
            retry_edits = retry_payload.get("files") or []
            if isinstance(retry_edits, list) and retry_edits:
                edits = retry_edits
                payload = retry_payload
                violations = _find_violations(edits)
        except Exception as e:
            logger.warning("[talk-build] preservation retry failed: %s", e)

    skipped = []
    if violations:
        # Still dropping features after the retry — refuse those file edits.
        skipped = sorted(violations.keys())
        edits = [e for e in edits if e.get("path") not in violations]

    changed_paths = []
    for edit in edits[:4]:
        path = edit.get("path")
        content = edit.get("content")
        if not path or not isinstance(content, str):
            continue
        await _emit(f"Editing {path}", "✍️")
        # Find the existing row or create a new one (LLM may suggest a new file).
        existing = await db.dev_code_files.find_one({"project_id": project["id"], "path": path}, {"_id": 0})
        if existing:
            # Snapshot the OLD content before we overwrite.
            from services.dev_os_snapshots import capture_snapshot
            await capture_snapshot(existing, reason="talk_to_build", actor="ai")
            await db.dev_code_files.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "content": content,
                    "size_bytes": len(content.encode("utf-8")),
                    "llm_status": "ai_edited",
                    "updated_at": now_iso(),
                }},
            )
        else:
            await db.dev_code_files.insert_one({
                "id": new_id(),
                "workspace_id": project["workspace_id"],
                "project_id": project["id"],
                "path": path,
                "kind": _kind_for_path(path),
                "role": "ai_edit",
                "content": content,
                "size_bytes": len(content.encode("utf-8")),
                "llm_status": "ai_edited",
                "created_at": now_iso(),
                "updated_at": now_iso(),
            })
        changed_paths.append(path)

    summary = payload.get("summary") or f"Updated {len(changed_paths)} file(s)."
    if skipped:
        summary += (
            f" ⚠️ Skipped edits to {', '.join(skipped)} because they would have "
            "removed existing features — try a more specific instruction."
        )
    return {
        "ok": True,
        "summary": summary,
        "files_changed": changed_paths,
        "skipped_files": skipped,
        "role_key": role_key,
    }


def _kind_for_path(path: str) -> str:
    if path.endswith(".html"): return "html"
    if path.endswith(".css"): return "css"
    if path.endswith(".js"): return "javascript"
    if path.endswith(".py"): return "python"
    if path.endswith(".sql"): return "sql"
    if path.endswith(".md"): return "markdown"
    return "text"
