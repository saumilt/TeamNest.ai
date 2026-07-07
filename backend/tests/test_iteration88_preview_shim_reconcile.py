"""Regression: preview/demo login shim must reconcile the `hidden` attribute.

Bug: generated app.js often reveals #app-view by only setting `style.display`
and never clearing the element's `hidden` attribute. Combined with the injected
`[hidden]{display:none !important}` render guard, the app stayed blank after
login (template marketplace demos + previews). The shim now injects a
MutationObserver that drops the stale `hidden` attribute when a view is revealed
via inline display.
"""
from services.dev_preview_shim import _inject_login_shim


def test_shim_injects_view_reconciliation():
    html = "<html><body><div id='login-view'></div><div id='app-view' hidden></div></body></html>"
    out = _inject_login_shim(html)
    # Storage namespacing + render guard still present.
    assert "tn-preview-guard" in out
    assert "[hidden]{display:none !important;}" in out
    # New reconciliation logic present.
    assert "_reconcileView" in out
    assert "removeAttribute('hidden')" in out
    assert "MutationObserver" in out


def test_shim_is_idempotent():
    html = "<html><body><p>hi</p></body></html>"
    once = _inject_login_shim(html)
    twice = _inject_login_shim(once)
    assert once == twice  # marker guard prevents double injection


def test_shim_appends_when_no_body():
    html = "<div id='app-view' hidden></div>"
    out = _inject_login_shim(html)
    assert "/* tn-login-shim */" in out
