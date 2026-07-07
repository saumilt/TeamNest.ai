import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiGet, apiPost, setAuthToken } from "./api";
import { deleteItem, getItem, setItem } from "./storage";

const TOKEN_KEY = "tn_token";

type User = any;

type AuthValue = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<any>;
  demoLogin: () => Promise<any>;
  redeem: (payload: any) => Promise<any>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
};

const AuthContext = createContext<AuthValue>({} as AuthValue);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getItem(TOKEN_KEY);
      if (t) {
        setAuthToken(t);
        try {
          const me = await apiGet("/api/auth/me");
          setUser(me);
          setToken(t);
        } catch {
          await deleteItem(TOKEN_KEY);
          setAuthToken(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (t: string, u: User) => {
    setAuthToken(t);
    await setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }, []);

  const login = async (email: string, password: string) => {
    const d = await apiPost("/api/auth/login", { email, password });
    if (d.mfa_required) {
      throw new Error("This account has MFA enabled — use it on the web app.");
    }
    await persist(d.token, d.user);
    return d;
  };

  const demoLogin = async () => {
    const d = await apiPost("/api/auth/demo-login", {});
    await persist(d.token, d.user);
    return d;
  };

  const redeem = async (payload: any) => {
    const d = await apiPost("/api/launch/code/redeem", payload);
    await persist(d.token, d.user);
    return d;
  };

  const logout = async () => {
    try {
      await apiPost("/api/auth/logout", {});
    } catch {}
    await deleteItem(TOKEN_KEY);
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ token, user, loading, login, demoLogin, redeem, logout, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
