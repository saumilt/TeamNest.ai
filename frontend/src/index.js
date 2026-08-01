import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register the PWA service worker (app-shell cache + OneSignal push).
// Enables "Install app" on desktop (Chrome/Edge) and mobile.
// updateViaCache:'none' + an explicit update() check ensures a new deploy is
// picked up immediately (no stale app shell after we ship new routes/pages).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { updateViaCache: "none" })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  });
}
