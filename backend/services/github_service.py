"""Real GitHub integration via fine-grained PAT (env: GITHUB_PAT).

This module replaces `dev_os_build.mock_github_export` with a true
api.github.com flow:

  1. Resolve the target repo (per-project owner/repo stored in
     dev_github_connections, or env-provided default).
  2. Resolve the default branch's HEAD SHA.
  3. Create a new branch `dev-os/v{N}-{slug}`.
  4. Upload markdown files (PROJECT_PLAN.md + README.md) via the contents API
     (PUT /repos/{o}/{r}/contents/{path}, base64-encoded body, branch=...).
  5. Open a PR (POST /repos/{o}/{r}/pulls).

Falls back to the existing mock when PAT is missing OR the repo isn't
configured, so the rest of the app keeps working in dev mode.
"""
from __future__ import annotations
import base64
import logging
import os
import re
from typing import Any, Dict, Optional

import httpx

from deps import db, new_id, now_iso

logger = logging.getLogger("teamnest")

_PAT = os.environ.get("GITHUB_PAT")
_DEFAULT_OWNER = os.environ.get("GITHUB_DEFAULT_OWNER")    # optional
_DEFAULT_REPO = os.environ.get("GITHUB_DEFAULT_REPO")      # optional
_API = "https://api.github.com"

_HEADERS_BASE = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def _slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s[:40] or "project"


def _headers() -> Dict[str, str]:
    h = dict(_HEADERS_BASE)
    h["Authorization"] = f"Bearer {_PAT}"
    return h


def configured() -> bool:
    return bool(_PAT)


async def _resolve_repo(workspace_id: str) -> Optional[Dict[str, str]]:
    """Look up the per-workspace GitHub repo config. Falls back to env vars."""
    conn = await db.dev_github_connections.find_one(
        {"workspace_id": workspace_id}, {"_id": 0},
    )
    if conn and conn.get("github_org") and conn.get("github_repo"):
        return {"owner": conn["github_org"], "repo": conn["github_repo"]}
    if _DEFAULT_OWNER and _DEFAULT_REPO:
        return {"owner": _DEFAULT_OWNER, "repo": _DEFAULT_REPO}
    return None


async def verify_pat() -> Dict[str, Any]:
    """`GET /user` — also tells us which login the PAT belongs to. Used by the
    integrations page to show the connected GitHub account."""
    if not configured():
        return {"ok": False, "reason": "not_configured"}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{_API}/user", headers=_headers())
        if r.status_code >= 400:
            return {"ok": False, "reason": "http_error", "status": r.status_code, "body": r.json() if r.text else None}
        u = r.json()
        return {"ok": True, "login": u.get("login"), "name": u.get("name"), "id": u.get("id"), "avatar_url": u.get("avatar_url")}
    except Exception as e:
        return {"ok": False, "reason": "exception", "error": str(e)}


async def _get_default_branch(client: httpx.AsyncClient, owner: str, repo: str) -> Optional[str]:
    r = await client.get(f"{_API}/repos/{owner}/{repo}", headers=_headers())
    if r.status_code >= 400:
        return None
    return (r.json() or {}).get("default_branch") or "main"


async def _get_branch_sha(client: httpx.AsyncClient, owner: str, repo: str, branch: str) -> Optional[str]:
    r = await client.get(
        f"{_API}/repos/{owner}/{repo}/git/ref/heads/{branch}",
        headers=_headers(),
    )
    if r.status_code >= 400:
        return None
    return ((r.json() or {}).get("object") or {}).get("sha")


async def _create_branch(client: httpx.AsyncClient, owner: str, repo: str, new_branch: str, base_sha: str) -> bool:
    r = await client.post(
        f"{_API}/repos/{owner}/{repo}/git/refs",
        headers=_headers(),
        json={"ref": f"refs/heads/{new_branch}", "sha": base_sha},
    )
    return r.status_code < 300


async def _put_file(client: httpx.AsyncClient, owner: str, repo: str, branch: str, path: str, content: str, message: str) -> bool:
    b64 = base64.b64encode(content.encode("utf-8")).decode("ascii")
    # If the file already exists on this branch we need its sha to update; otherwise omit.
    sha = None
    r = await client.get(
        f"{_API}/repos/{owner}/{repo}/contents/{path}",
        headers=_headers(),
        params={"ref": branch},
    )
    if r.status_code == 200:
        sha = (r.json() or {}).get("sha")
    body: Dict[str, Any] = {"message": message, "content": b64, "branch": branch}
    if sha:
        body["sha"] = sha
    r = await client.put(
        f"{_API}/repos/{owner}/{repo}/contents/{path}",
        headers=_headers(),
        json=body,
    )
    return r.status_code < 300


async def _open_pr(client: httpx.AsyncClient, owner: str, repo: str, head: str, base: str, title: str, body: str) -> Optional[Dict[str, Any]]:
    r = await client.post(
        f"{_API}/repos/{owner}/{repo}/pulls",
        headers=_headers(),
        json={"title": title, "head": head, "base": base, "body": body},
    )
    if r.status_code >= 400:
        return None
    return r.json()


def _render_plan(project: Dict[str, Any]) -> str:
    plan = project.get("plan") or {}
    pillars = plan.get("pillars") or []
    decisions = plan.get("decisions") or []
    risks = plan.get("risks") or []
    out = [
        f"# {project.get('name', 'Project')} · Plan",
        "",
        plan.get("product_brief") or "_No brief yet._",
        "",
    ]
    if pillars:
        out += ["## Pillars", ""] + [f"- {p}" for p in pillars] + [""]
    if decisions:
        out += ["## Decisions", ""] + [f"- {d}" for d in decisions] + [""]
    if risks:
        out += ["## Risks", ""] + [f"- {r}" for r in risks] + [""]
    out += [
        "## Meta",
        f"- Version: `{project.get('version', 'v0.1.0')}`",
        f"- Health: `{project.get('health', 'stable')}`",
        f"- Source: `dev_os · workspace {project.get('workspace_id', '?')[:8]}`",
        "",
        "_Generated by TeamNest Dev OS._",
    ]
    return "\n".join(out)


def _render_readme(project: Dict[str, Any]) -> str:
    return (
        f"# {project.get('name', 'Project')}\n\n"
        f"{(project.get('description') or '_AI-built project from TeamNest Dev OS._')[:600]}\n\n"
        f"See [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) for the full product plan.\n"
    )


async def real_export(project: Dict[str, Any], requested_by: str) -> Dict[str, Any]:
    """Open a REAL PR for this project. Falls back gracefully when GitHub
    isn't configured. Returns the same {ok, pr} shape as the mock."""
    if not configured():
        return {"ok": False, "reason": "github_pat_not_set"}
    target = await _resolve_repo(project["workspace_id"])
    if not target:
        return {"ok": False, "reason": "github_repo_not_configured"}
    owner, repo = target["owner"], target["repo"]

    last_build = await db.dev_builds.find_one(
        {"project_id": project["id"], "build_status": "success"},
        {"_id": 0, "build_number": 1},
        sort=[("build_number", -1)],
    )
    build_num = (last_build or {}).get("build_number", 1)
    branch = f"dev-os/v{build_num}-{_slug(project.get('name'))}"

    plan_md = _render_plan(project)
    readme_md = _render_readme(project)
    commit_msg = f"Dev OS v{build_num} · {project.get('name', 'project')[:60]}"

    try:
        async with httpx.AsyncClient(timeout=30) as c:
            base = await _get_default_branch(c, owner, repo)
            if not base:
                return {"ok": False, "reason": "repo_not_found_or_no_access"}
            base_sha = await _get_branch_sha(c, owner, repo, base)
            if not base_sha:
                return {"ok": False, "reason": "no_base_branch_sha"}
            ok = await _create_branch(c, owner, repo, branch, base_sha)
            if not ok:
                # Branch already exists — that's fine, continue with the existing one.
                pass
            ok1 = await _put_file(c, owner, repo, branch, "PROJECT_PLAN.md", plan_md, commit_msg)
            ok2 = await _put_file(c, owner, repo, branch, "README.md", readme_md, commit_msg)
            if not (ok1 and ok2):
                return {"ok": False, "reason": "commit_failed"}
            # ── Push every AI-generated code file too ─────────────────
            # Until now we only pushed the two docs. Now that the build
            # pipeline writes real frontend/backend/db/test files into
            # dev_code_files, surface those in the PR so it's an actual
            # shippable changeset — not just plans.
            generated_files = await db.dev_code_files.find(
                {"project_id": project["id"]}, {"_id": 0},
            ).to_list(500)
            pushed_count = 2  # plan + readme
            for f in generated_files:
                # Skip README at the workspace root — we already wrote one.
                if f.get("path") == "README.md":
                    continue
                ok = await _put_file(
                    c, owner, repo, branch, f["path"],
                    f.get("content") or "", commit_msg,
                )
                if ok:
                    pushed_count += 1
            pr = await _open_pr(
                c, owner, repo, head=branch, base=base,
                title=f"Dev OS · {project.get('name', 'project')} · v{build_num}",
                body=plan_md,
            )
            if not pr:
                return {"ok": False, "reason": "pr_open_failed"}
    except Exception as e:
        logger.warning("[github] real_export failed: %s", e)
        return {"ok": False, "reason": "exception", "error": str(e)}

    pr_row = {
        "id": new_id(),
        "workspace_id": project["workspace_id"],
        "project_id": project["id"],
        "github_repo": f"https://github.com/{owner}/{repo}",
        "branch": branch,
        "pr_number": pr.get("number"),
        "pr_url": pr.get("html_url"),
        "title": pr.get("title"),
        "summary": (pr.get("body") or "")[:1000],
        "status": "open",
        "created_by": requested_by,
        "files_changed": pushed_count,
        "additions": (pr.get("additions") or 0),
        "deletions": (pr.get("deletions") or 0),
        "real": True,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_pull_requests.insert_one(pr_row.copy())
    await db.dev_github_connections.update_one(
        {"workspace_id": project["workspace_id"]},
        {"$set": {"last_sync_at": now_iso(), "status": "connected"}},
        upsert=True,
    )

    # Fire-and-forget: AI Reviewer posts review comments on the PR.
    # Falls back to an in-chat reviewer message if the PAT can't post issue
    # comments. Wrapped so a review failure never breaks the PR creation.
    try:
        import asyncio
        asyncio.create_task(_post_ai_review_comment(project, pr_row, generated_files))
    except Exception as e:
        logger.warning("[github] failed to schedule AI review: %s", e)

    return {"ok": True, "pr": pr_row}


async def _post_ai_review_comment(
    project: Dict[str, Any], pr_row: Dict[str, Any], files: list,
) -> None:
    """Generate a short AI review and post it as an issue comment on the PR.

    We use the issue-comments API (`POST /repos/{owner}/{repo}/issues/{num}/comments`)
    rather than the line-by-line review API to keep the PAT scope minimum
    (`repo` is enough). If the LLM key isn't set, just no-op silently — the
    main PR was already created successfully which is the user-visible thing.
    """
    if not files:
        return
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return
        catalog = "\n\n".join(
            f"### {f['path']}\n```\n{(f.get('content') or '')[:3000]}\n```"
            for f in files[:6]
        )
        prompt = (
            f"You are a senior engineer reviewing this Pull Request. "
            f"PR title: {pr_row.get('title')}. "
            "Read the files below and produce a SHORT review (~6-10 bullet "
            "points). Cover: 1) Overall summary, 2) any bugs / correctness "
            "issues, 3) security concerns, 4) 2-3 concrete improvements. "
            "Be direct and useful. Markdown.\n\n"
            f"{catalog}"
        )
        llm = (
            LlmChat(
                api_key=key,
                session_id=f"review-{pr_row['id'][:8]}",
                system_message="You are an experienced staff engineer doing pull request reviews.",
            )
            .with_model("openai", "gpt-5.4-mini")
        )
        body = await llm.send_message(UserMessage(text=prompt))
        if not body:
            return
        comment_md = (
            "🤖 **TeamNest AI Reviewer**\n\n"
            f"{body.strip()}\n\n"
            "---\n*Auto-generated when the PR was opened. Trigger another "
            "review from the Dev Studio toolbar.*"
        )
        owner, repo = project["github_repo"], project["github_repo_name"]
        pr_number = pr_row.get("pr_number")
        if not pr_number:
            return
        async with httpx.AsyncClient(headers=_headers(), timeout=20) as c:
            r = await c.post(
                f"{_API}/repos/{owner}/{repo}/issues/{pr_number}/comments",
                json={"body": comment_md},
            )
            if r.status_code in (200, 201):
                await db.dev_pull_requests.update_one(
                    {"id": pr_row["id"]},
                    {"$set": {
                        "ai_review_posted": True,
                        "ai_review_posted_at": now_iso(),
                    }},
                )
                logger.info("[github] posted AI review comment on PR #%s", pr_number)
            else:
                logger.warning(
                    "[github] AI review comment failed (%s): %s",
                    r.status_code, r.text[:200],
                )
    except Exception as e:
        logger.warning("[github] AI review comment failed: %s", e)


async def export_or_fallback(project: Dict[str, Any], requested_by: str) -> Dict[str, Any]:
    """Used by routes: try the real export first, fall back to the existing
    mocked one when GitHub isn't configured."""
    real = await real_export(project, requested_by)
    if real.get("ok"):
        return real
    # Surface a meaningful reason but also fall back to a mock so the user
    # still sees a PR row in the UI for demo workspaces.
    from services.dev_os_build import mock_github_export
    fallback = await mock_github_export(project, requested_by)
    return {"ok": fallback.get("ok"), "pr": fallback.get("pr"), "real_failed_reason": real.get("reason")}
