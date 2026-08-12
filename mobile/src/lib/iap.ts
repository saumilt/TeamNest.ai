import { apiGet, apiPost } from "@/src/api";
import { findPackageByProductId, iapAvailable, purchasePackage } from "./revenuecat";

// Variable / one-time consumables (marketplace installs, storage packs) use the
// PENDING-ORDER pattern: the backend records a pending order and returns the
// store product to buy; after the App Store purchase, the signed RevenueCat
// webhook matches (product + user) to that order and fulfills it server-side.
// The client just polls the order until it flips to "fulfilled".

export type ConsumableKind = "storage_pack" | "marketplace_install";

export function iapConsumablesAvailable(): boolean {
  return iapAvailable();
}

export type ConsumableResult = {
  fulfilled: boolean;
  order_id: string;
  result?: any;
};

export async function purchaseConsumableIap(
  kind: ConsumableKind,
  refId: string,
): Promise<ConsumableResult> {
  const { order_id, product_id } = await apiPost("/api/billing/iap/order", {
    kind,
    ref_id: refId,
  });
  const pkg = await findPackageByProductId(product_id);
  if (!pkg) {
    throw new Error("This item becomes available once the app is published to the App Store.");
  }
  await purchasePackage(pkg);
  // Poll for the webhook to fulfill (grants are only ever server-side).
  for (let i = 0; i < 10; i++) {
    const o = await apiGet(`/api/billing/iap/order/${order_id}`).catch(() => null);
    if (o?.status === "fulfilled") return { fulfilled: true, order_id, result: o.result };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { fulfilled: false, order_id };
}
