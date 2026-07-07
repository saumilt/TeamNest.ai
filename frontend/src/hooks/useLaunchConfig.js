import { useEffect, useState } from "react";

// Module-level cache — every consumer shares one fetch per page load.
let _cfg = null;
let _promise = null;

export function fetchLaunchConfig() {
  if (_cfg) return Promise.resolve(_cfg);
  if (!_promise) {
    _promise = fetch(`${process.env.REACT_APP_BACKEND_URL}/api/launch/config`)
      .then((r) => r.json())
      .then((d) => { _cfg = d; return d; })
      .catch(() => ({ mode: "open" })); // fail-open so a backend blip never bricks the site
  }
  return _promise;
}

/** {mode, allow_open_signup, allow_public_pricing, allow_public_checkout, ...} or null while loading */
export function useLaunchConfig() {
  const [cfg, setCfg] = useState(_cfg);
  useEffect(() => {
    let on = true;
    fetchLaunchConfig().then((d) => { if (on) setCfg(d); });
    return () => { on = false; };
  }, []);
  return cfg;
}

export const isInviteOnly = (cfg) =>
  !!cfg && cfg.mode !== "open" && !cfg.allow_open_signup;
