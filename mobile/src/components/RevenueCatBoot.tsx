import { useEffect } from "react";
import { apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { IAP_SUPPORTED, configureRevenueCat } from "@/src/lib/revenuecat";

// Configures RevenueCat with the logged-in user's id once auth is ready, and
// links that id + active workspace on the backend so purchases apply to the
// right place. No-op on web / when IAP isn't supported. Mounted at the root.
export function RevenueCatBoot() {
  const { user, token } = useAuth();
  useEffect(() => {
    if (!IAP_SUPPORTED || !user?.id || !token) return;
    configureRevenueCat(user.id);
    apiPost("/api/billing/iap/register", { app_user_id: user.id }).catch(() => {});
  }, [user?.id, token]);
  return null;
}
