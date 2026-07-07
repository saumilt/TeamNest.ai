/**
 * native.js — Thin runtime bridge for Capacitor.
 *
 * Safe to import on web: every helper checks `Capacitor.isNativePlatform()`
 * before invoking native code, so on plain web (PWA / browser) every function
 * is a no-op. On iOS / Android wrappers the plugins fire.
 *
 * Usage:
 *   import { initNativeShell, registerPush, hapticTap, sharePayload, unlockWithBiometrics } from "@/lib/native";
 *   useEffect(() => { initNativeShell(); }, []);
 */
import { Capacitor } from "@capacitor/core";

export const isNative = () =>
  typeof Capacitor !== "undefined" && Capacitor.isNativePlatform?.();

export const platform = () =>
  typeof Capacitor !== "undefined" ? Capacitor.getPlatform?.() : "web";

/**
 * Boot all native-only side effects. Call once from the top of <App/>.
 */
export async function initNativeShell() {
  if (!isNative()) return;
  try {
    const [{ StatusBar, Style }, { SplashScreen }, { Keyboard }, { App }] =
      await Promise.all([
        import("@capacitor/status-bar"),
        import("@capacitor/splash-screen"),
        import("@capacitor/keyboard"),
        import("@capacitor/app"),
      ]);

    // Match the dark theme of the web app.
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    await StatusBar.setBackgroundColor({ color: "#0a0a0a" }).catch(() => {});

    // Smooth keyboard resize on iOS
    await Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});

    // Hide splash after first paint
    setTimeout(() => SplashScreen.hide().catch(() => {}), 600);

    // Hardware back button on Android → use router history if possible
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
  } catch (err) {
    console.warn("[native] init skipped:", err?.message || err);
  }
}

/**
 * Register for push notifications and forward the device token to backend.
 * Backend endpoint: POST /api/devices/register  { token, platform }
 */
export async function registerPush(apiBase, authToken) {
  if (!isNative()) return null;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return null;
    await PushNotifications.register();

    return new Promise((resolve) => {
      PushNotifications.addListener("registration", async (token) => {
        try {
          await fetch(`${apiBase}/api/devices/register`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ token: token.value, platform: platform() }),
          });
        } catch (registerErr) {
          // Push token registration route may not exist yet on the backend.
          console.warn("[native] push token register failed:", registerErr?.message || registerErr);
        }
        resolve(token.value);
      });
      PushNotifications.addListener("registrationError", () => resolve(null));
    });
  } catch (err) {
    console.warn("[native] push skipped:", err?.message || err);
    return null;
  }
}

export async function hapticTap(style = "light") {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    const map = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    };
    await Haptics.impact({ style: map[style] || ImpactStyle.Light });
  } catch (e) { console.debug("[native] haptic skipped:", e?.message); }
}

export async function sharePayload({ title, text, url }) {
  if (!isNative()) {
    if (navigator.share) return navigator.share({ title, text, url });
    return null;
  }
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, text, url, dialogTitle: title });
  } catch (e) { console.debug("[native] share skipped:", e?.message); }
}

export async function pickPhoto() {
  if (!isNative()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import(
      "@capacitor/camera"
    );
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
    });
    return photo.dataUrl;
  } catch (err) {
    if (err?.message?.includes("cancel")) return null;
    throw err;
  }
}

/**
 * Prompt the user for Face ID / Fingerprint. Resolves true on success.
 * Falls through to true on web so existing flows aren't blocked.
 */
export async function unlockWithBiometrics(reason = "Unlock TeamNest") {
  if (!isNative()) return true;
  try {
    const { NativeBiometric } = await import("capacitor-native-biometric");
    const { isAvailable } = await NativeBiometric.isAvailable();
    if (!isAvailable) return true;
    await NativeBiometric.verifyIdentity({
      reason,
      title: "TeamNest",
      subtitle: "Confirm it's you",
      description: reason,
    });
    return true;
  } catch {
    return false;
  }
}
