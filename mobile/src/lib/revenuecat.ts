import { Platform } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";

// Native RevenueCat wrapper (iOS + Android). The web bundle resolves
// revenuecat.web.ts instead, so react-native-purchases never reaches web.
// Everything is defensive so the app never crashes when IAP is unavailable
// (e.g. Expo Go, or before store keys/products are configured).

const APPLE_KEY = process.env.EXPO_PUBLIC_RC_APPLE_KEY;
const GOOGLE_KEY = process.env.EXPO_PUBLIC_RC_GOOGLE_KEY;

let configured = false;

export const IAP_SUPPORTED = Platform.OS === "ios" || Platform.OS === "android";

function keyForPlatform(): string | undefined {
  return Platform.OS === "ios" ? APPLE_KEY : GOOGLE_KEY;
}

export function iapAvailable(): boolean {
  return IAP_SUPPORTED && !!keyForPlatform();
}

export async function configureRevenueCat(userId: string): Promise<void> {
  if (!IAP_SUPPORTED || !userId) return;
  const apiKey = keyForPlatform();
  if (!apiKey) return;
  try {
    if (configured) {
      await Purchases.logIn(userId);
      return;
    }
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
  } catch {
    // IAP not available in this runtime (e.g. Expo Go) — ignore.
  }
}

export async function getOfferings(): Promise<any> {
  if (!iapAvailable()) return { current: null, all: {} };
  try {
    return await Purchases.getOfferings();
  } catch {
    return { current: null, all: {} };
  }
}

export async function getCustomerInfo(): Promise<any | null> {
  if (!iapAvailable()) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

export async function purchasePackage(pkg: any): Promise<any> {
  return Purchases.purchasePackage(pkg);
}

export async function restorePurchases(): Promise<any | null> {
  if (!iapAvailable()) return null;
  return Purchases.restorePurchases();
}

// Find a package across every offering (current + all named) by its store
// product identifier — used by the pending-order consumable flow, where the
// backend tells us which product tier to buy.
export async function findPackageByProductId(productId: string): Promise<any | null> {
  const off = await getOfferings();
  const buckets: any[][] = [];
  if (off?.current?.availablePackages) buckets.push(off.current.availablePackages);
  const all = off?.all || {};
  for (const k of Object.keys(all)) {
    if (all[k]?.availablePackages) buckets.push(all[k].availablePackages);
  }
  for (const pkgs of buckets) {
    for (const p of pkgs) {
      if ((p.product?.identifier || p.identifier) === productId) return p;
    }
  }
  return null;
}
