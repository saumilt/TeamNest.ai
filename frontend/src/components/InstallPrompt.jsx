import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Smartphone, Share, Plus, X, Download } from "lucide-react";
import safeStorage from "@/lib/safeStorage";

/**
 * "Install on your phone" prompt.
 *
 * Behavior:
 * - On Android Chrome the browser fires `beforeinstallprompt` — we capture
 *   that and trigger the native install dialog when the user clicks Install.
 * - On iOS Safari (which lacks `beforeinstallprompt`) we show a tutorial
 *   modal explaining the Share → Add to Home Screen flow.
 * - When already installed (display-mode: standalone) the button hides itself.
 * - We also auto-show a soft banner once per device (storage-flagged)
 *   on the user's 3rd app open or after they've sent 5+ messages, so we don't
 *   nag day-one users.
 */

const STORAGE_KEYS = {
  promptDismissed: "pwa-prompt-dismissed",
  promptShownAt: "pwa-prompt-shown-at",
  appOpens: "app-opens",
};

function getDevice() {
  if (typeof navigator === "undefined") return { ios: false, android: false };
  const ua = navigator.userAgent.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(ua) && !window.MSStream;
  const android = /android/.test(ua);
  return { ios, android };
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator?.standalone === true
  );
}

export default function InstallPrompt({ inline = false }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showIosModal, setShowIosModal] = useState(false);
  const [autoShown, setAutoShown] = useState(false);
  const promptShownRef = useRef(false);

  const device = getDevice();
  const desktop = !device.ios && !device.android;
  const canTriggerNative = !!deferredPrompt;
  const canShowIosInstructions = device.ios && !installed;

  useEffect(() => {
    if (installed) return;
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      toast.success("🎉 TeamNest.ai installed on your device");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [installed]);

  // Soft auto-prompt logic — show once on 3rd+ open if not dismissed.
  useEffect(() => {
    if (installed || autoShown || promptShownRef.current || inline) return;
    const opens = safeStorage.getNumber(STORAGE_KEYS.appOpens, 0) + 1;
    safeStorage.set(STORAGE_KEYS.appOpens, opens);
    if (safeStorage.get(STORAGE_KEYS.promptDismissed) === "1") return;
    if (opens < 3) return;
    const lastShown = safeStorage.getNumber(STORAGE_KEYS.promptShownAt, 0);
    // Don't re-show more than once every 14 days
    if (lastShown && Date.now() - lastShown < 14 * 86_400_000) return;
    if (!(canTriggerNative || canShowIosInstructions)) return;
    promptShownRef.current = true;
    safeStorage.set(STORAGE_KEYS.promptShownAt, Date.now());
    setAutoShown(true);
  }, [canTriggerNative, canShowIosInstructions, installed, autoShown, inline]);

  const triggerInstall = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          setInstalled(true);
        }
        setDeferredPrompt(null);
        setAutoShown(false);
      } catch (err) {
        console.warn("[install]", err);
      }
    } else if (device.ios) {
      setShowIosModal(true);
      setAutoShown(false);
    } else {
      toast.info("Open the menu in your browser and choose 'Install app' or 'Add to Home Screen'");
    }
  };

  const dismiss = () => {
    safeStorage.set(STORAGE_KEYS.promptDismissed, "1");
    setAutoShown(false);
  };

  if (installed) return null;

  // Inline call-to-action variant — for embedding in landing pages.
  if (inline) {
    if (!(canTriggerNative || device.ios || device.android)) return null;
    return (
      <button
        data-testid="install-pwa-inline"
        onClick={triggerInstall}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-sm border border-yellow-400/40 bg-yellow-500/5 hover:bg-yellow-500/10 text-yellow-200 font-mono uppercase tracking-widest text-[10px] transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        {desktop ? "Install desktop app" : "Install app"}
      </button>
    );
  }

  // Auto-shown soft banner (bottom-left)
  if (!autoShown) return null;
  return (
    <>
      <div
        data-testid="pwa-install-banner"
        className="fixed bottom-4 left-4 right-4 md:left-6 md:right-auto md:max-w-sm z-50 bg-[#0a0a0a] border border-yellow-400/30 rounded-sm shadow-xl p-4 flex items-start gap-3"
      >
        <div className="w-9 h-9 bg-yellow-400 text-black flex items-center justify-center rounded-sm shrink-0 font-display font-extrabold text-sm">
          TN
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-sm leading-tight mb-1">
            {desktop ? "Install the desktop app" : "Install TeamNest.ai"}
          </div>
          <div className="text-[11px] text-zinc-400 leading-relaxed mb-3">
            {desktop
              ? "Add TeamNest.ai to your desktop — its own window, a Dock/Taskbar icon, and desktop notifications."
              : "Add to your home screen for instant access, full-screen mode, and faster opens."}
          </div>
          <div className="flex gap-2">
            <button
              data-testid="pwa-install-go"
              onClick={triggerInstall}
              className="px-3 py-1.5 rounded-sm bg-yellow-500 hover:bg-yellow-400 text-black font-mono uppercase tracking-widest text-[9px]"
            >
              Install
            </button>
            <button
              data-testid="pwa-install-dismiss"
              onClick={dismiss}
              className="px-3 py-1.5 rounded-sm border border-white/10 hover:bg-white/5 text-zinc-400 font-mono uppercase tracking-widest text-[9px]"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-zinc-500 hover:text-white p-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {showIosModal && <IosInstructions onClose={() => setShowIosModal(false)} />}
    </>
  );
}

function IosInstructions({ onClose }) {
  return (
    <div
      data-testid="ios-install-modal"
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0a0a0a] border border-yellow-400/30 rounded-sm max-w-md w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-zinc-500 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <Smartphone className="w-6 h-6 text-yellow-400" />
          <h2 className="font-display text-xl font-bold tracking-tight">Install on iPhone</h2>
        </div>
        <ol className="space-y-4 text-sm">
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center text-[10px] font-mono shrink-0">1</span>
            <span className="text-zinc-300">
              Tap the <Share className="inline w-4 h-4 text-blue-400 mx-0.5" /> <span className="font-semibold">Share</span> icon at the bottom of Safari.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center text-[10px] font-mono shrink-0">2</span>
            <span className="text-zinc-300">
              Scroll down and tap <Plus className="inline w-4 h-4 mx-0.5" /> <span className="font-semibold">Add to Home Screen</span>.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center text-[10px] font-mono shrink-0">3</span>
            <span className="text-zinc-300">
              Tap <span className="font-semibold">Add</span> in the top-right. TeamNest.ai will appear on your home screen.
            </span>
          </li>
        </ol>
        <div className="text-[11px] text-zinc-500 mt-5 pt-4 border-t border-white/5">
          Tip: this only works in Safari (not Chrome on iOS — Apple limitation).
        </div>
      </div>
    </div>
  );
}
