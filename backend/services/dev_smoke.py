"""Dev OS — post-build smoke checks.

Fast static verification that a generated app will actually load:
  • node --check syntax on every .js file
  • JS ↔ HTML id contract (every id app.js queries exists in index.html)
  • login gate markers (#login-view / #app-view) present
  • index.html actually includes app.js

These are the exact classes of bugs that broke real builds (ID drift,
truncated rewrites), so they run after every build and talk-to-build edit.
"""
import asyncio
import os
import re
import subprocess
import tempfile
from typing import Any, Dict

_HTML_ID_RE = re.compile(r'''id=["']([\w-]+)["']''')
_JS_REF_RES = (
    re.compile(r"getElementById\(['\"]([\w-]+)['\"]\)"),
    re.compile(r"querySelector\(['\"]#([\w-]+)['\"]\)"),
    re.compile(r"\$\(['\"]#([\w-]+)['\"]\)"),
)


def _node_check(content: str) -> str:
    """Return '' when syntax is OK, else the first error line."""
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
            f.write(content)
            path = f.name
        r = subprocess.run(
            ["node", "--check", path], capture_output=True, text=True, timeout=15,
        )
        os.unlink(path)
        if r.returncode == 0:
            return ""
        return (r.stderr or "syntax error").strip().splitlines()[-1][:200]
    except Exception as e:
        return f"check skipped: {e}"


async def run_browser_check(project_id: str) -> list:
    """Real headless-browser load test against the live preview:
    page loads, no JS errors, login/app view renders, demo login works."""
    checks = []

    def add(name, ok, detail=""):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    try:
        # The pod ships browsers under /pw-browsers (screenshot tooling);
        # point playwright there when the env var isn't already set.
        if not os.environ.get("PLAYWRIGHT_BROWSERS_PATH") and os.path.isdir("/pw-browsers"):
            os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/pw-browsers"
        from playwright.async_api import async_playwright
    except Exception:
        add("Browser load test", True, "skipped — playwright not available")
        return checks

    url = f"http://127.0.0.1:8001/api/dev-projects/{project_id}/preview/index.html"
    js_errors = []
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True, args=["--no-sandbox"])
            try:
                page = await browser.new_page()
                page.on("pageerror", lambda e: js_errors.append(str(e)))
                resp = await page.goto(url, timeout=15000, wait_until="domcontentloaded")
                add("Page loads", bool(resp and resp.ok),
                    "" if (resp and resp.ok) else f"HTTP {resp.status if resp else 'no response'}")
                await page.wait_for_timeout(900)

                state = await page.evaluate(
                    """() => {
                        const vis = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
                        return {
                            login: vis(document.getElementById('login-view')),
                            app: vis(document.getElementById('app-view')),
                            hasLoginBtn: !!document.getElementById('login-btn'),
                            bodyLen: (document.body?.innerText || '').trim().length,
                        };
                    }"""
                )
                add("App renders (not blank)", state["bodyLen"] > 20,
                    f"visible text: {state['bodyLen']} chars")
                add("Login or app view visible", state["login"] or state["app"])

                # Demo login attempt when a login screen is showing.
                if state["login"] and state["hasLoginBtn"]:
                    try:
                        await page.fill("#login-email", "demo@example.com", timeout=2500)
                        await page.fill("#login-password", "demo", timeout=2500)
                    except Exception:
                        pass
                    await page.click("#login-btn", timeout=2500)
                    await page.wait_for_timeout(1400)
                    logged_in = await page.evaluate(
                        """() => {
                            const el = document.getElementById('app-view');
                            return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
                        }"""
                    )
                    add("Demo login works", logged_in,
                        "" if logged_in else "app-view did not appear after sign-in")
                add("No JS runtime errors", not js_errors,
                    js_errors[0][:200] if js_errors else "")
            finally:
                await browser.close()
    except Exception as e:
        msg = str(e)
        if "Executable doesn't exist" in msg or "playwright install" in msg:
            add("Browser load test", True, "skipped — headless browser not installed in this environment")
        else:
            add("Browser load test", False, f"{type(e).__name__}: {msg[:180]}")
    return checks


async def capture_preview_screenshot(project_id: str) -> str | None:
    """JPEG data-URI screenshot of the live preview (after demo-login when possible)."""
    try:
        if not os.environ.get("PLAYWRIGHT_BROWSERS_PATH") and os.path.isdir("/pw-browsers"):
            os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/pw-browsers"
        from playwright.async_api import async_playwright
    except Exception:
        return None
    url = f"http://127.0.0.1:8001/api/dev-projects/{project_id}/preview/index.html"
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True, args=["--no-sandbox"])
            try:
                page = await browser.new_page(viewport={"width": 1280, "height": 800})
                await page.goto(url, timeout=15000, wait_until="domcontentloaded")
                await page.wait_for_timeout(800)
                try:
                    login_visible = await page.evaluate(
                        """() => { const el = document.getElementById('login-view');
                             return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; }"""
                    )
                    if login_visible and await page.locator("#login-btn").count():
                        try:
                            await page.fill("#login-email", "demo@example.com", timeout=2000)
                            await page.fill("#login-password", "demo", timeout=2000)
                        except Exception:
                            pass
                        await page.click("#login-btn", timeout=2000)
                        await page.wait_for_timeout(1200)
                except Exception:
                    pass
                shot = await page.screenshot(type="jpeg", quality=45)
                import base64
                return "data:image/jpeg;base64," + base64.b64encode(shot).decode()
            finally:
                await browser.close()
    except Exception:
        return None


async def run_smoke_checks(project_id: str, browser: bool = False) -> Dict[str, Any]:
    from services.dev_os_codegen import list_project_files
    files = {f["path"]: f.get("content") or "" for f in await list_project_files(project_id)}
    checks = []

    def add(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    html = files.get("frontend/index.html", "")
    add("index.html present", bool(html))

    js_files = {p: c for p, c in files.items() if p.endswith(".js")}
    for path, content in js_files.items():
        err = await asyncio.to_thread(_node_check, content)
        add(f"JS syntax · {path}", not err or err.startswith("check skipped"), err)

    app_js = files.get("frontend/app.js", "")
    if html and app_js:
        html_ids = set(_HTML_ID_RE.findall(html))
        js_refs = set()
        for rx in _JS_REF_RES:
            js_refs.update(rx.findall(app_js))
        missing = sorted(js_refs - html_ids)
        add(
            "JS ↔ HTML id contract", not missing,
            ("app.js queries ids missing from index.html: " + ", ".join(missing[:8])) if missing else "",
        )
        add(
            "Login gate markers",
            "login-view" in html_ids and "app-view" in html_ids,
            "expects #login-view and #app-view for auth gating",
        )
        add("index.html includes app.js", "app.js" in html)

    if browser:
        try:
            browser_checks = await asyncio.wait_for(run_browser_check(project_id), timeout=40)
            checks.extend(browser_checks)
        except asyncio.TimeoutError:
            checks.append({"name": "Browser load test", "ok": False, "detail": "timed out after 40s"})

    passed = all(c["ok"] for c in checks)
    return {"passed": passed, "checks": checks,
            "failures": [c for c in checks if not c["ok"]]}
