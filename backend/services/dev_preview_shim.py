"""Login shim + render guard injected into every served preview/production HTML."""

_LOGIN_SHIM_MARKER = "/* tn-login-shim */"

_DEMO_WATERMARK_MARKER = "tn-demo-watermark"
_DEMO_WATERMARK = (
    f'<div id="{_DEMO_WATERMARK_MARKER}" style="position:fixed;bottom:10px;right:10px;'
    "z-index:2147483647;background:rgba(9,9,11,.85);color:#fbbf24;"
    "font:600 11px/1 ui-sans-serif,system-ui,sans-serif;padding:6px 10px;"
    "border-radius:999px;border:1px solid rgba(251,191,36,.4);pointer-events:none;"
    'letter-spacing:.02em">TeamNest demo preview</div>'
)


def _inject_demo_watermark(html: str) -> str:
    """Fixed 'TeamNest demo preview' badge — served-time, demo workspaces only."""
    if _DEMO_WATERMARK_MARKER in html:
        return html
    if "</body>" in html:
        return html.replace("</body>", _DEMO_WATERMARK + "</body>", 1)
    return html + _DEMO_WATERMARK


def _inject_login_shim(html: str) -> str:
    """Inject a resilient demo-login bootstrap into the served preview
    HTML. The shim runs AFTER the page's own scripts and only acts if the
    user is not yet authenticated — it hunts for an email + password input
    + a sign-in button by id, name, placeholder OR visible text, so the
    SPA always logs in with `demo@example.com / demo` regardless of the
    ids the LLM-generated index.html chose. Idempotent (no-op if the marker
    is already present)."""
    if _LOGIN_SHIM_MARKER in html:
        return html
    # Serve-time render guard: (1) generated CSS sometimes sets `display`
    # on #login-view/#app-view which overrides the `hidden` attribute —
    # making BOTH views render side-by-side; (2) some generated pages
    # disable scrolling or overflow the pane. Enforce sane defaults.
    guard = (
        "<style id=\"tn-preview-guard\">"
        "[hidden]{display:none !important;}"
        "html,body{overflow:auto !important;max-width:100vw;}"
        "html{scrollbar-width:thin;}"
        "img,video,canvas,table{max-width:100%;}"
        "input,textarea,select{max-width:100%;box-sizing:border-box;}"
        "</style>"
    )
    shim = (
        guard +
        "<script>" + _LOGIN_SHIM_MARKER + "\n"
        "(function(){\n"
        "  // Storage isolation: previews share the platform origin, so EVERY\n"
        "  // key a generated app touches is transparently prefixed with its\n"
        "  // project/slug namespace — apps can't read platform keys ('tn:*')\n"
        "  // or each other's data, and clear() only wipes their own namespace.\n"
        "  try{\n"
        "    var _m=location.pathname.match(/\\/dev-projects\\/([0-9a-fA-F-]{10,})\\/preview|\\/p\\/([a-z0-9-]{3,40})(?:\\/|$)|\\/share\\/preview\\/([A-Za-z0-9-]+)|\\/preview\\/shared\\/([A-Za-z0-9-]+)|\\/templates\\/([a-z0-9-]+)\\/demo/);\n"
        "    var _ns=_m?(_m[1]||_m[2]||_m[3]||_m[4]||(_m[5]&&('demo-'+_m[5]))):null;\n"
        "    if(_ns){\n"
        "      var _P='tn:'+_ns+':';\n"
        "      var _sp=Storage.prototype,_g=_sp.getItem,_s=_sp.setItem,_r=_sp.removeItem,_c=_sp.clear;\n"
        "      var _w=function(k){k=String(k);return k.indexOf(_P)===0?k:_P+k;};\n"
        "      _sp.getItem=function(k){return _g.call(this,_w(k));};\n"
        "      _sp.setItem=function(k,v){return _s.call(this,_w(k),v);};\n"
        "      _sp.removeItem=function(k){return _r.call(this,_w(k));};\n"
        "      _sp.clear=function(){\n"
        "        var i,ks=[];for(i=0;i<this.length;i++){var kk=this.key(i);if(kk&&kk.indexOf(_P)===0)ks.push(kk);}\n"
        "        for(i=0;i<ks.length;i++)_r.call(this,ks[i]);\n"
        "      };\n"
        "    }\n"
        "  }catch(_e){}\n"
        "  function ready(fn){if(document.readyState!=='loading')return fn();document.addEventListener('DOMContentLoaded',fn);}\n"
        "  // Delegated capture listener installs IMMEDIATELY (this inline script\n"
        "  // runs at parse time, before deferred app.js) — so Sign in works even\n"
        "  // while app.js is still downloading on slow connections.\n"
        "  // FALLBACK-ONLY: let the app's own login logic run first. Only if\n"
        "  // the login view is still showing ~600ms after the click do we\n"
        "  // auto-login with the demo credentials. (A synchronous takeover here\n"
        "  // used to clobber generated apps that have real auth, e.g. role pickers.)\n"
        "  var _fb=null;\n"
        "  function scheduleFallback(){\n"
        "    if(_fb) clearTimeout(_fb);\n"
        "    _fb=setTimeout(function(){\n"
        "      _fb=null;\n"
        "      try{if(localStorage.getItem('app:auth')) return;}catch(err){}\n"
        "      var lv=document.getElementById('login-view');\n"
        "      if(lv && (lv.hidden||getComputedStyle(lv).display==='none')) return;\n"
        "      var av=document.getElementById('app-view');\n"
        "      if(av && !av.hidden && getComputedStyle(av).display!=='none') return;\n"
        "      tryLogin();\n"
        "    }, 600);\n"
        "  }\n"
        "  document.addEventListener('click', function(e){\n"
        "    var b=e.target && e.target.closest ? e.target.closest('button,input[type=submit]') : null;\n"
        "    if(!b) return;\n"
        "    var t=(b.textContent||b.value||'').trim().toLowerCase();\n"
        "    var isLogin=(b.id==='login-btn'||b.id==='signin-btn'||b.id==='sign-in-btn'||t==='sign in'||t==='log in'||t==='login'||t==='signin');\n"
        "    if(!isLogin) return;\n"
        "    try{if(localStorage.getItem('app:auth')) return;}catch(err){}\n"
        "    scheduleFallback();\n"
        "  }, true);\n"
        "  // View reconciliation: many generated app.js only flip `style.display`\n"
        "  // to switch between #login-view and #app-view and never clear the\n"
        "  // element's `hidden` attribute. The [hidden]{display:none!important}\n"
        "  // guard (and the UA stylesheet) then keep the target hidden — a blank\n"
        "  // page after login. Whenever the app sets an inline display that isn't\n"
        "  // 'none' on either view, drop the stale `hidden` attribute so the\n"
        "  // app's own intent wins (guard still protects against double-render).\n"
        "  function _reconcileView(el){if(!el)return;var d=el.style.display;if(d!=='none'){if(el.hasAttribute('hidden'))el.removeAttribute('hidden');}}\n"
        "  function _reconcileViews(){_reconcileView(document.getElementById('login-view'));_reconcileView(document.getElementById('app-view'));}\n"
        "  try{\n"
        "    var _viewMO=new MutationObserver(_reconcileViews);\n"
        "    ready(function(){['login-view','app-view'].forEach(function(id){var el=document.getElementById(id);if(el)_viewMO.observe(el,{attributes:true,attributeFilter:['style']});});_reconcileViews();setTimeout(_reconcileViews,300);setTimeout(_reconcileViews,900);});\n"
        "  }catch(_e2){}\n"
        "  ready(function(){setTimeout(install, 250);});\n"
        "  function findEmail(){return document.querySelector(\"input[type=email], input[name*=email i], input[id*=email i], input[placeholder*=email i]\");}\n"
        "  function findPwd(){return document.querySelector(\"input[type=password]\");}\n"
        "  function findBtn(){\n"
        "    var byId=document.querySelector('#login-btn,#signin-btn,#sign-in-btn,button[type=submit]');\n"
        "    if(byId) return byId;\n"
        "    var btns=document.querySelectorAll('button,input[type=submit]');\n"
        "    for(var i=0;i<btns.length;i++){var t=(btns[i].textContent||btns[i].value||'').trim().toLowerCase();if(t==='sign in'||t==='log in'||t==='login'||t==='signin') return btns[i];}\n"
        "    return null;\n"
        "  }\n"
        "  function tryLogin(){\n"
        "    var em=findEmail(), pw=findPwd();\n"
        "    if(!em||!pw) return false;\n"
        "    if(!em.value) em.value='demo@example.com';\n"
        "    if(!pw.value) pw.value='demo';\n"
        "    var ok=(em.value.trim().toLowerCase()==='demo@example.com' && pw.value==='demo');\n"
        "    if(!ok){\n"
        "      var errEl=document.querySelector('#login-error, .login-error, [data-login-error]');\n"
        "      if(errEl){errEl.textContent='Wrong email or password. Try demo@example.com / demo.';errEl.classList.remove('hidden');errEl.style.display='block';}\n"
        "      return true;\n"
        "    }\n"
        "    try{localStorage.setItem('app:auth', JSON.stringify({email:em.value,loggedAt:new Date().toISOString()}));}catch(e){}\n"
        "    var loginView=document.getElementById('login-view');\n"
        "    var appView=document.getElementById('app-view');\n"
        "    if(loginView){loginView.hidden=true;loginView.style.display='none';}\n"
        "    if(appView){appView.hidden=false;appView.style.display='';if(getComputedStyle(appView).display==='none'){appView.style.display='block';}}\n"
        "    if(!appView){\n"
        "      // No app-view defined by the LLM — at minimum hide the login card so the user sees the page.\n"
        "      var card=em.closest('section,form,div'); if(card){card.style.opacity='0';setTimeout(function(){card.style.display='none';},250);}\n"
        "      var note=document.createElement('div');note.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#fbbf24;font:600 14px ui-sans-serif,system-ui';note.textContent='Signed in as demo@example.com — main app view not generated yet.';document.body.appendChild(note);\n"
        "    }\n"
        "    // Re-run any custom enterApp/render the page exposed.\n"
        "    try{if(typeof enterApp==='function') enterApp();}catch(e){}\n"
        "    try{if(typeof render==='function') render();}catch(e){}\n"
        "    return true;\n"
        "  }\n"
        "  function install(){\n"
        "    // If the LLM-generated app.js already handled auth and we are now in app-view, do nothing.\n"
        "    try{if(localStorage.getItem('app:auth')) return;}catch(e){}\n"
        "    var btn=findBtn();\n"
        "    if(btn && !btn.__tnShim){btn.__tnShim=true;btn.addEventListener('click', function(){scheduleFallback();}, true);}\n"
        "    var pw=findPwd();\n"
        "    if(pw && !pw.__tnShim){pw.__tnShim=true;pw.addEventListener('keydown', function(e){if(e.key==='Enter'){scheduleFallback();}}, true);}\n"
        "    var form=document.querySelector('form');\n"
        "    if(form && !form.__tnShim){form.__tnShim=true;form.addEventListener('submit', function(e){e.preventDefault();scheduleFallback();}, false);}\n"
        "  }\n"
        "})();\n"
        "</script>"
    )
    # Insert before </body> if present, otherwise append.
    lower = html.lower()
    idx = lower.rfind("</body>")
    if idx >= 0:
        return html[:idx] + shim + html[idx:]
    return html + shim




# CSP applied to every served preview/production/demo HTML document.
# Hardening: generated apps may include CDN scripts and inline JS, but they
# must never call back into the platform API (connect-src 'none') or be
# framed by third-party sites (frame-ancestors 'self').
PREVIEW_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https:; "
    "style-src 'self' 'unsafe-inline' https:; "
    "font-src 'self' data: https:; "
    "img-src 'self' data: blob: https:; "
    "media-src 'self' data: https:; "
    "connect-src 'none'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'self'"
)

# Full header set for served preview/production/demo HTML. Since previews
# share the platform origin (no separate subdomain in this environment),
# defense-in-depth = CSP + storage namespacing (shim) + these headers.
PREVIEW_HEADERS = {
    "Content-Security-Policy": PREVIEW_CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Resource-Policy": "same-origin",
}
