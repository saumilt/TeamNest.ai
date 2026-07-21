import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { clearOneSignalUser, setOneSignalUser } from "@/lib/onesignal";

const AuthCtx = createContext(null);

/**
 * Auth state is driven entirely by the HttpOnly `tn_session` cookie set by the
 * backend. We hit `/auth/me` on mount; if the cookie is valid, we get back
 * the user. If 401, we leave user=null and the app renders the Welcome screen.
 *
 * The historical `token` field returned by login/signup is still set into the
 * api module so legacy code paths (WS reconnects, Bearer-header callers) can
 * pick it up, but we no longer persist it to localStorage — the cookie is the
 * source of truth.
 */
export function AuthProvider({ children }) {
        const [user, setUser] = useState(null);
        const [workspaces, setWorkspaces] = useState([]);
        const [loading, setLoading] = useState(true);

        const refresh = useCallback(async () => {
                try {
                        const { data } = await api.get("/auth/me");
                        const { workspaces: ws = [], ...userOnly } = data;
                        setUser(userOnly);
                        setWorkspaces(ws);
                } catch (e) {
                        // Not authenticated yet — expected on first visit. Log for debugging.
                        if (e?.response?.status !== 401) {
                                console.debug("[auth] /auth/me failed:", e?.message);
                        }
                        setUser(null);
                        setWorkspaces([]);
                } finally {
                        setLoading(false);
                }
        }, []);

        useEffect(() => {
                refresh();
        }, [refresh]);

        // Bind / unbind the OneSignal external_id whenever auth state changes
        // so daily-digest pushes can target this user.
        useEffect(() => {
                if (user?.id) {
                        setOneSignalUser(user.id);
                } else {
                        clearOneSignalUser();
                }
        }, [user?.id]);

        const _apply = useCallback((data) => {
                setUser(data.user);
                setWorkspaces(data.workspaces || []);
                return data.user;
        }, []);

        const login = useCallback(
                async (email, password) => {
                        const { data } = await api.post("/auth/login", { email, password });
                        if (data?.mfa_required) {
                                // Caller (login form) handles the MFA challenge step.
                                return { mfaRequired: true, mfaToken: data.mfa_token, email: data.email };
                        }
                        return _apply(data);
                },
                [_apply],
        );

        const completeMfaLogin = useCallback(
                (data) => _apply(data),
                [_apply],
        );

        const signup = useCallback(
                async (name, email, password, phone) => {
                        const { data } = await api.post("/auth/signup", {
                                name,
                                email,
                                password,
                                phone: phone || undefined,
                        });
                        return _apply(data);
                },
                [_apply],
        );

        const demoLogin = useCallback(async () => {
                const { data } = await api.post("/auth/demo-login");
                // Flag a fresh demo session so <WelcomeTour> auto-fires once.
                // sessionStorage scope is intentional — every new tab / device
                // gets the tour again, but a single evaluator only sees it once.
                try { window.sessionStorage.setItem("tn:show-welcome-tour", "1"); } catch { /* ignore */ }
                return _apply(data);
        }, [_apply]);

        const logout = useCallback(async () => {
                try {
                        await api.post("/auth/logout");
                } catch (e) {
                        console.debug("[auth] logout server call failed:", e?.message);
                }
                setUser(null);
                setWorkspaces([]);
        }, []);

        const setAuthFromRedeem = useCallback((token, userData, workspacesList) => {
                // `token` arg kept for backwards compatibility — invite redemption used
                // to return a token. With cookie auth the backend has already set the
                // session cookie on the redeem response, so the token is unused here.
                setUser(userData);
                setWorkspaces(workspacesList || []);
        }, []);

        const switchWorkspace = useCallback(async (workspace_id) => {
                const { data } = await api.post("/workspace/switch", { workspace_id });
                setUser(data.user);
                setWorkspaces(data.workspaces || []);
                return data.user;
        }, []);

        const createWorkspace = useCallback(async (name, planId = "free") => {
                const { data } = await api.post("/workspace/create", { name, plan_id: planId });
                setUser(data.user);
                setWorkspaces(data.workspaces || []);
                return data;
        }, []);

        const value = useMemo(
                () => ({
                        user,
                        workspaces,
                        loading,
                        login,
                        completeMfaLogin,
                        signup,
                        demoLogin,
                        logout,
                        refresh,
                        setAuthFromRedeem,
                        switchWorkspace,
                        createWorkspace,
                }),
                [user, workspaces, loading, login, completeMfaLogin, signup, demoLogin, logout, refresh, setAuthFromRedeem, switchWorkspace, createWorkspace],
        );

        return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
