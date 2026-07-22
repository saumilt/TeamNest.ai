/**
 * OneSignal Web SDK — lazy loader + identity binding.
 *
 * Works in both the browser AND inside Capacitor's WebView (Capacitor 7's
 * WebView is just a Chrome/WKWebView with full notification API support, so
 * we don't need a separate Cordova plugin for our daily-digest use case).
 *
 * Init flow:
 *   1. Inject the official OneSignal SDK script tag on first call.
 *   2. Call OneSignal.init({ appId }) — only once per page.
 *   3. When a TeamNest user is authenticated, alias them via
 *      OneSignal.login(user.id). Pushes target via this external_id.
 *   4. On logout, call OneSignal.logout().
 *
 * Permission prompting is intentionally deferred — we only ask after the
 * user clicks the "Send me a test push" button in Governance OR after the
 * first time the app has something meaningful to notify about.
 */

const APP_ID = process.env.REACT_APP_ONESIGNAL_APP_ID;
let initPromise = null;
let lastExternalId = null;

function _loadScript() {
        if (typeof window === "undefined") return Promise.resolve(null);
        if (window.OneSignalDeferred && window.OneSignal) return Promise.resolve(window.OneSignal);
        return new Promise((resolve) => {
                const existing = document.querySelector('script[data-onesignal-sdk]');
                if (existing) {
                        existing.addEventListener("load", () => resolve(window.OneSignal));
                        return;
                }
                window.OneSignalDeferred = window.OneSignalDeferred || [];
                const s = document.createElement("script");
                s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
                s.defer = true;
                s.setAttribute("data-onesignal-sdk", "true");
                s.onload = () => resolve(window.OneSignal);
                s.onerror = () => resolve(null);
                document.head.appendChild(s);
        });
}

export async function ensureOneSignal() {
        if (!APP_ID) return null;
        if (initPromise) return initPromise;
        initPromise = (async () => {
                const sdk = await _loadScript();
                if (!sdk && !window.OneSignalDeferred) return null;
                return new Promise((resolve) => {
                        const deferred = window.OneSignalDeferred || [];
                        deferred.push(async (OneSignal) => {
                                try {
                                        await OneSignal.init({
                                                appId: APP_ID,
                                                allowLocalhostAsSecureOrigin: true,
                                                serviceWorkerParam: { scope: "/" },
                                                serviceWorkerPath: "service-worker.js",
                                                notifyButton: { enable: false },
                                        });
                                        resolve(OneSignal);
                                } catch {
                                        resolve(null);
                                }
                        });
                        window.OneSignalDeferred = deferred;
                });
        })();
        return initPromise;
}

/** Bind a TeamNest user to OneSignal so backend pushes can target via external_id. */
export async function setOneSignalUser(userId) {
        if (!userId || userId === lastExternalId) return;
        const sdk = await ensureOneSignal();
        if (!sdk) return;
        try {
                await sdk.login(String(userId));
                lastExternalId = userId;
        } catch {
                /* ignore — alias bind is best-effort */
        }
}

export async function clearOneSignalUser() {
        if (!lastExternalId) return;
        const sdk = await ensureOneSignal();
        if (!sdk) return;
        try {
                await sdk.logout();
        } catch {
                /* ignore */
        }
        lastExternalId = null;
}

/** Prompt the user for push permission (call from a user gesture). */
export async function requestPushPermission() {
        const sdk = await ensureOneSignal();
        if (!sdk) return "unsupported";
        try {
                const granted = await sdk.Notifications.requestPermission();
                return granted ? "granted" : "denied";
        } catch {
                return "denied";
        }
}

/** Cheap status read used by the Governance UI banner. */
export async function getOneSignalStatus() {
        if (!APP_ID) return { configured: false };
        const sdk = await ensureOneSignal();
        if (!sdk) return { configured: true, ready: false };
        try {
                const subscribed = sdk.User?.PushSubscription?.optedIn ?? false;
                const permission = typeof Notification !== "undefined" ? Notification.permission : "default";
                return { configured: true, ready: true, subscribed, permission };
        } catch {
                return { configured: true, ready: true, subscribed: false, permission: "default" };
        }
}
