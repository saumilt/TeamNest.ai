// Web stub for RevenueCat — the Expo web preview (and any web build) never
// loads react-native-purchases. In-app purchases only exist in the native
// iOS/Android builds; on web we simply report "unavailable".

export const IAP_SUPPORTED = false;

export function iapAvailable(): boolean {
  return false;
}

export async function configureRevenueCat(_userId: string): Promise<void> {
  /* no-op on web */
}

export async function getOfferings(): Promise<any> {
  return { current: null, all: {} };
}

export async function getCustomerInfo(): Promise<any | null> {
  return null;
}

export async function purchasePackage(_pkg: any): Promise<any> {
  throw new Error("In-app purchases aren't available on the web build.");
}

export async function restorePurchases(): Promise<any | null> {
  return null;
}

export async function findPackageByProductId(_productId: string): Promise<any | null> {
  return null;
}
