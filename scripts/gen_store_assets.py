#!/usr/bin/env python3
"""Generate App Store / Play Store upload assets for TeamNest.ai mobile.

Renders faithful, on-brand device mockups of each core feature into the EXACT
pixel sizes the stores require, using headless Chromium. Outputs:
  - iOS screenshots       1290 x 2796  (6.7"/6.9" iPhone)
  - Android screenshots   1080 x 1920  (phone, 9:16)
  - Play feature graphic  1024 x 500
  - App icons             1024 x 1024 (iOS), 512 x 512 (Play)
"""
import os
from playwright.sync_api import sync_playwright

PUB = "/app/frontend/public/store-assets"
IOS = f"{PUB}/ios"
AND = f"{PUB}/android"
GFX = f"{PUB}/graphics"
for d in (IOS, AND, GFX):
    os.makedirs(d, exist_ok=True)

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Sora:wght@400;600;700&display=swap" rel="stylesheet">')

# ---- shared screen CSS (base 288 x 604 logical) ----
SCREEN_CSS = """
:root{--bg:#08080b;--elevated:#17171c;--line:#26262e;--ink:#f4f4f5;--muted:#a1a1aa;--dim:#71717a;--accent:#facc15;--accent2:#f59e0b;--green:#34d399;--danger:#f87171;}
.screen{width:288px;height:604px;background:var(--bg);display:flex;flex-direction:column;font-family:'Sora',system-ui,sans-serif;color:var(--ink);overflow:hidden}
.statusbar{height:40px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 18px 5px;font-size:11px;font-weight:600}
.appbody{flex:1;display:flex;flex-direction:column;overflow:hidden;padding:6px 15px 0}
.apphead{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}
.apphead h4{font-family:'Poppins';font-weight:800;font-size:21px;letter-spacing:-.6px}
.cred{display:flex;gap:5px;align-items:center}
.flamepill{background:#fff;border-radius:999px;height:24px;padding:0 8px;display:flex;align-items:center;gap:4px;font-weight:800;color:#09090b;font-size:10.5px}
.creditspill{background:var(--accent);border-radius:999px;height:24px;padding:0 4px 0 8px;display:flex;align-items:center;gap:4px;font-weight:800;color:#09090b;font-size:10.5px}
.creditspill .more{background:#fff;border-radius:999px;padding:2px 5px;font-size:9px}
.tabbar{height:56px;display:flex;align-items:center;justify-content:space-around;border-top:1px solid var(--line);background:#0c0c10}
.tab{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:9.5px;color:var(--dim);font-weight:600}
.tab.on{color:var(--accent)}.tab .dot{font-size:15px}
.row{display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #17171c}
.av{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:13px;color:#09090b;flex:0 0 auto}
.av.ai{background:linear-gradient(135deg,var(--accent),var(--accent2))}
.av.g1{background:#3f3f46;color:#e4e4e7}.av.g2{background:#334155;color:#cbd5e1}.av.g3{background:#4c1d95;color:#ddd6fe}
.rowb{flex:1;min-width:0}.rowt{display:flex;justify-content:space-between;align-items:center;gap:8px}
.rowt .nm{font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rowt .tm{color:var(--dim);font-size:10px;flex:0 0 auto}
.pv{color:var(--muted);font-size:11.5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.msgs{flex:1;display:flex;flex-direction:column;gap:11px;padding-top:8px;overflow:hidden}
.bubble{max-width:84%;padding:10px 12px;border-radius:15px;font-size:12.5px;line-height:1.5}
.bubble .who{font-size:10px;font-weight:700;margin-bottom:3px}
.b-out{align-self:flex-end;background:rgba(250,204,21,.14);border:1px solid rgba(250,204,21,.3)}
.b-in{align-self:flex-start;background:var(--elevated);border:1px solid var(--line)}
.b-ai{align-self:flex-start;background:linear-gradient(180deg,rgba(52,211,153,.10),rgba(52,211,153,.03));border:1px solid rgba(52,211,153,.28)}
.b-ai .who{color:var(--green)}
.chip-inline{display:inline-block;background:rgba(250,204,21,.16);color:var(--accent);border-radius:6px;padding:1px 5px;font-weight:700}
.chatinput{margin:8px -15px 0;padding:11px 15px;border-top:1px solid var(--line);display:flex;align-items:center;gap:9px;color:var(--dim);font-size:11.5px}
.chatinput .send{margin-left:auto;width:32px;height:32px;border-radius:50%;background:var(--accent);display:grid;place-items:center;color:#09090b;font-weight:800}
.sub{color:var(--muted);font-size:11.5px;line-height:1.5;margin:-2px 0 12px}
.label{color:var(--dim);font-size:9.5px;font-weight:700;letter-spacing:1.3px;margin:12px 0 8px}
.chips{display:flex;gap:7px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--elevated);border-radius:999px;padding:6px 11px;font-size:11px;font-weight:600;color:var(--muted)}
.chip.on{border-color:rgba(250,204,21,.5);background:rgba(250,204,21,.12);color:var(--accent)}
.askcard{margin-top:12px;background:var(--elevated);border:1px solid var(--line);border-radius:15px;padding:11px}
.askcard .q{color:var(--ink);font-size:12px;line-height:1.5}
.runbtn{margin-top:10px;background:var(--accent);border-radius:999px;height:38px;display:flex;align-items:center;justify-content:center;gap:7px;color:#09090b;font-weight:800;font-size:12px}
.synth{margin-top:14px;background:var(--elevated);border:1px solid rgba(250,204,21,.35);border-radius:15px;padding:12px}
.synth .h{display:flex;align-items:center;gap:6px;color:var(--accent);font-weight:700;font-size:12px;margin-bottom:7px}
.synth p{color:#d4d4d8;font-size:11.5px;line-height:1.55}
.addrow{display:flex;gap:7px;align-items:center;margin-bottom:8px}
.addinput{flex:1;background:var(--elevated);border:1px solid var(--line);border-radius:11px;padding:11px;color:var(--dim);font-size:12px}
.addbtn{width:42px;height:42px;border-radius:11px;background:var(--accent);display:grid;place-items:center;color:#09090b;font-size:21px;font-weight:800}
.task{display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-bottom:1px solid #17171c}
.cbx{width:21px;height:21px;border-radius:50%;border:2px solid #52525b;flex:0 0 auto;margin-top:1px}
.tk .tt{display:block;font-weight:600;font-size:12.5px}
.tk .mt{display:flex;align-items:center;gap:6px;margin-top:4px;color:var(--dim);font-size:10px}
.pdot{width:7px;height:7px;border-radius:50%}
.p-urgent{background:var(--danger)}.p-high{background:var(--accent)}.p-med{background:#a1a1aa}
.profile{display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 0 8px}
.bigav{width:70px;height:70px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:grid;place-items:center;font-weight:800;font-size:24px;color:#fff}
.profile .nm{font-family:'Poppins';font-weight:800;font-size:17px;margin-top:5px}
.profile .em{color:var(--muted);font-size:12px}
.rolebadge{margin-top:5px;background:rgba(250,204,21,.14);border:1px solid rgba(250,204,21,.4);color:var(--accent);border-radius:999px;padding:3px 11px;font-size:9.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.card{margin-top:12px;background:var(--elevated);border:1px solid var(--line);border-radius:15px;padding:2px 14px}
.inforow{display:flex;align-items:center;gap:11px;padding:11px 0;border-bottom:1px solid #17171c;font-size:12px}
.inforow:last-child{border-bottom:0}.inforow .k{color:var(--muted);flex:1}.inforow .v{color:var(--ink);font-weight:600}
.ic{color:var(--dim)}
"""

SB = '<div class="statusbar"><span>9:41</span><span>&#128246; &nbsp;100%</span></div>'

SCREENS = {
"chats": SB + """
<div class="appbody">
  <div class="apphead"><h4>Chats</h4><div class="cred"><div class="flamepill">&#128293; 300</div><div class="creditspill">&#10022; Credits <span class="more">20% more</span></div></div></div>
  <div class="row"><div class="av ai">AI</div><div class="rowb"><div class="rowt"><span class="nm">My AI Assistant</span></div><div class="pv">Ask me anything, anytime</div></div></div>
  <div class="row"><div class="av g1">MS</div><div class="rowb"><div class="rowt"><span class="nm">Marketing Site Refresh</span><span class="tm">7:31</span></div><div class="pv">New hero copy proposal is in the doc</div></div></div>
  <div class="row"><div class="av g2">QP</div><div class="rowb"><div class="rowt"><span class="nm">Q2 Product Launch</span><span class="tm">7:28</span></div><div class="pv">Let's lock the Pro-tier launch pricing</div></div></div>
  <div class="row"><div class="av g3">E</div><div class="rowb"><div class="rowt"><span class="nm">Engineering</span><span class="tm">7:25</span></div><div class="pv">Try @dev &mdash; ask the AI architect</div></div></div>
</div>
<div class="tabbar"><div class="tab on"><span class="dot">&#128172;</span>Chats</div><div class="tab"><span class="dot">&#10022;</span>Research</div><div class="tab"><span class="dot">&#10003;</span>Tasks</div><div class="tab"><span class="dot">&#9717;</span>You</div></div>
""",
"chat": SB + """
<div class="appbody">
  <div class="apphead" style="border-bottom:1px solid var(--line);padding-bottom:9px"><div><div style="font-family:'Poppins';font-weight:800;font-size:15px">&lsaquo; Q2 Product Launch</div><div style="color:var(--dim);font-size:10px">50 members &middot; 3 AI teammates</div></div></div>
  <div class="msgs">
    <div class="bubble b-in"><div class="who" style="color:var(--muted)">Priya</div>Should we launch Pro at $20 or $29 / seat?</div>
    <div class="bubble b-out">Let's ask the room. <span class="chip-inline">@ai</span> compare pricing strategies for a B2B SaaS launch</div>
    <div class="bubble b-ai"><div class="who">&#10022; AI &middot; synthesized from 4 models</div>$20 wins on adoption &amp; virality; $29 lifts ARPU ~18% but slows top-of-funnel. Recommend $20 launch + annual discount, revisit at 1k seats.</div>
    <div class="bubble b-out">Perfect. <span class="chip-inline">@devmanager</span> spin up a pricing page A/B test</div>
  </div>
  <div class="chatinput">&#128279; &nbsp;&#128444; &nbsp;Message &middot; try @ai or @devmanager <span class="send">&#8593;</span></div>
</div>
""",
"research": SB + """
<div class="appbody">
  <div class="apphead"><h4>AI Research</h4><div class="cred"><div class="flamepill">&#128293; 300</div></div></div>
  <div class="sub">Ask once, compare answers across models, get one synthesized result.</div>
  <div class="label">MODELS TO COMPARE</div>
  <div class="chips"><div class="chip on">ChatGPT</div><div class="chip on">Claude</div><div class="chip on">Gemini</div><div class="chip">DeepSeek</div><div class="chip">Perplexity</div><div class="chip">Grok</div></div>
  <div class="askcard"><div class="q">Compare Postgres vs MongoDB for a real-time chat app at scale.</div><div class="runbtn">&#10022; Compare 3 models</div></div>
  <div class="synth"><div class="h">&#8987; Synthesized answer</div><p>Postgres (with logical replication) for durability &amp; relational queries; add Redis for fan-out. MongoDB shines for flexible message schemas &amp; horizontal sharding&hellip;</p></div>
</div>
""",
"tasks": SB + """
<div class="appbody">
  <div class="apphead"><h4>Tasks</h4><div class="cred"><div class="flamepill">&#128293; 300</div><div class="creditspill">&#10022; Credits <span class="more">20% more</span></div></div></div>
  <div class="addrow"><div class="addinput">Add a task&hellip;</div><div class="addbtn">+</div></div>
  <div class="task"><div class="cbx"></div><div class="tk"><span class="tt">Finalize Pro-tier launch pricing</span><span class="mt"><span class="pdot p-urgent"></span> urgent &middot; due today</span></div></div>
  <div class="task"><div class="cbx"></div><div class="tk"><span class="tt">Ship pricing page A/B test</span><span class="mt"><span class="pdot p-high"></span> high &middot; due Fri</span></div></div>
  <div class="task"><div class="cbx"></div><div class="tk"><span class="tt">Draft launch announcement copy</span><span class="mt"><span class="pdot p-med"></span> medium &middot; due Mon</span></div></div>
  <div class="task"><div class="cbx"></div><div class="tk"><span class="tt">Review AI search index design</span><span class="mt"><span class="pdot p-med"></span> medium</span></div></div>
</div>
<div class="tabbar"><div class="tab"><span class="dot">&#128172;</span>Chats</div><div class="tab"><span class="dot">&#10022;</span>Research</div><div class="tab on"><span class="dot">&#10003;</span>Tasks</div><div class="tab"><span class="dot">&#9717;</span>You</div></div>
""",
"you": SB + """
<div class="appbody">
  <div class="apphead"><h4>You</h4><div class="cred"><div class="flamepill">&#128293; 300</div><div class="creditspill">&#10022; Credits <span class="more">20% more</span></div></div></div>
  <div class="profile"><div class="bigav">AP</div><div class="nm">Amit Patel</div><div class="em">amit@demo.team</div><div class="rolebadge">Owner</div></div>
  <div class="card"><div class="inforow"><span class="ic">&#9636;</span><span class="k">Workspace</span><span class="v">Demo Team</span></div><div class="inforow"><span class="ic">&#9993;</span><span class="k">Email</span><span class="v">amit@demo.team</span></div><div class="inforow"><span class="ic">&#9678;</span><span class="k">Workspaces</span><span class="v">3</span></div></div>
  <div class="card"><div class="inforow"><span class="ic">&#128737;</span><span class="k">Privacy Policy</span><span class="ic">&#8599;</span></div><div class="inforow"><span class="ic">&#128196;</span><span class="k">Terms of Service</span><span class="ic">&#8599;</span></div><div class="inforow"><span class="ic">&#9937;</span><span class="k">Help &amp; Support</span><span class="ic">&#8599;</span></div></div>
</div>
""",
}

CAPTIONS = {
    "chats":    ("Your team + AI, one chat", "Every conversation and an AI assistant in each workspace"),
    "chat":     ("AI teammates in the thread", "Mention @ai to compare models or @devmanager to build"),
    "research": ("Ask once. Compare every model.", "ChatGPT, Claude, Gemini, DeepSeek, Perplexity & Grok in parallel"),
    "tasks":    ("Turn talk into done", "Capture action items and track them by priority"),
    "you":      ("You're always in control", "Profile, workspaces, privacy & in-app account deletion"),
}
ORDER = ["chats", "chat", "research", "tasks", "you"]

BG = ("radial-gradient(900px 500px at 12% -8%, rgba(250,204,21,.18), transparent 60%),"
      "radial-gradient(900px 600px at 100% 0%, rgba(52,211,153,.14), transparent 55%),"
      "linear-gradient(180deg,#0b0b10 0%, #050506 100%)")


def shot_html(W, H, key):
    title, sub = CAPTIONS[key]
    pad = 20
    screen_h = H * 0.685
    S = (screen_h - 2 * pad) / 604.0
    tsize = int(W * 0.052)
    ssize = int(W * 0.028)
    br = int(52 * S)
    return f"""<!doctype html><html><head><meta charset='utf-8'>{FONTS}<style>
*{{margin:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px}}
.canvas{{width:{W}px;height:{H}px;background:{BG};display:flex;flex-direction:column;align-items:center;
  font-family:'Poppins',sans-serif;padding-top:{int(H*0.055)}px}}
.headline{{text-align:center;padding:0 {int(W*0.08)}px;margin-bottom:{int(H*0.02)}px}}
.headline h1{{color:#fff;font-weight:800;font-size:{tsize}px;line-height:1.08;letter-spacing:-1px}}
.headline h1 em{{font-style:normal;background:linear-gradient(90deg,#facc15,#34d399);-webkit-background-clip:text;background-clip:text;color:transparent}}
.headline p{{color:#a1a1aa;font-family:'Sora';font-size:{ssize}px;margin-top:{int(H*0.012)}px;line-height:1.45}}
.device{{position:relative;width:{288*S+2*pad}px;height:{604*S+2*pad}px;border-radius:{br+pad}px;padding:{pad}px;
  background:linear-gradient(160deg,#33333b,#0c0c0f);
  box-shadow:0 40px 90px -25px rgba(0,0,0,.85), 0 0 0 2px #000 inset;}}
.device .wrap{{width:{288*S}px;height:{604*S}px;border-radius:{br}px;overflow:hidden}}
{SCREEN_CSS}
.screen{{border-radius:{br}px;transform:scale({S});transform-origin:top left}}
.island{{position:absolute;top:{int(pad+8*S)}px;left:50%;transform:translateX(-50%);width:{int(96*S)}px;height:{int(26*S)}px;background:#000;border-radius:{int(16*S)}px;z-index:20}}
</style></head><body>
<div class='canvas'>
  <div class='headline'><h1>{title.replace('.', '.<br>') if '. ' in title else title}</h1><p>{sub}</p></div>
  <div class='device'><div class='wrap'><div class='screen'>{SCREENS[key]}</div></div><div class='island'></div></div>
</div></body></html>"""


FEATURE_GFX = f"""<!doctype html><html><head><meta charset='utf-8'>{FONTS}<style>
*{{margin:0;box-sizing:border-box}}
.g{{width:1024px;height:500px;background:{BG};display:flex;align-items:center;padding:0 60px;font-family:'Poppins'}}
.left{{flex:1}}
.logo{{width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#facc15,#f59e0b);display:grid;place-items:center;font-weight:800;color:#09090b;font-size:26px;margin-bottom:22px}}
.left h1{{color:#fff;font-weight:800;font-size:46px;line-height:1.05;letter-spacing:-1.2px}}
.left h1 em{{font-style:normal;background:linear-gradient(90deg,#facc15,#34d399);-webkit-background-clip:text;background-clip:text;color:transparent}}
.left p{{color:#a1a1aa;font-family:'Sora';font-size:19px;margin-top:16px;max-width:520px;line-height:1.5}}
</style></head><body><div class='g'><div class='left'>
<div class='logo'>TN</div>
<h1>TeamNest<em>.ai</em><br>team chat, research &amp; building</h1>
<p>AI-native team communication for iOS &amp; Android. Chat with your team and AI, compare every model, and ship.</p>
</div></div></body></html>"""

ICON = """<!doctype html><html><head><meta charset='utf-8'><style>
*{margin:0}.i{width:SIZEpx;height:SIZEpx;background:linear-gradient(135deg,#facc15,#f59e0b);display:grid;place-items:center;
font-family:sans-serif;font-weight:900;color:#09090b;font-size:FSpx;letter-spacing:-2px}
</style></head><body><div class='i'>TN</div></body></html>"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        def render(html, W, H, path):
            pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
            pg.set_content(html, wait_until="networkidle")
            pg.wait_for_timeout(400)
            pg.screenshot(path=path, clip={"x": 0, "y": 0, "width": W, "height": H})
            pg.close()
            print("  ->", path)

        print("iOS 1290x2796:")
        for i, k in enumerate(ORDER, 1):
            render(shot_html(1290, 2796, k), 1290, 2796, f"{IOS}/{i:02d}-{k}.png")
        print("Android 1080x1920:")
        for i, k in enumerate(ORDER, 1):
            render(shot_html(1080, 1920, k), 1080, 1920, f"{AND}/{i:02d}-{k}.png")
        print("Graphics:")
        render(FEATURE_GFX, 1024, 500, f"{GFX}/play-feature-graphic-1024x500.png")
        render(ICON.replace("SIZE", "1024").replace("FS", "440"), 1024, 1024, f"{GFX}/icon-ios-1024.png")
        render(ICON.replace("SIZE", "512").replace("FS", "220"), 512, 512, f"{GFX}/icon-play-512.png")
        b.close()
    print("DONE")


if __name__ == "__main__":
    main()
