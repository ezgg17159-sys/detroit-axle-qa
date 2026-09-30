import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  clearSession,
  ensureCsrfToken,
  fetchMe,
  loginRequest,
  logoutRequest,
  purgeLegacyTokenStorage,
  storeUser,
  type AuthUser,
} from "../lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  bootstrapping: boolean;
  login: (login: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    purgeLegacyTokenStorage();
    let cancelled = false;
    void (async () => {
      try {
        await ensureCsrfToken();
        const me = await fetchMe();
        if (!cancelled) {
          storeUser(me);
          setUser(me);
        }
      } catch {
        if (!cancelled) {
          clearSession();
          setUser(null);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();

    const onExpired = () => {
      clearSession();
      setUser(null);
    };
    window.addEventListener("daq:auth-expired", onExpired);

    return () => {
      cancelled = true;
      window.removeEventListener("daq:auth-expired", onExpired);
    };
  }, []);

  const login = useCallback(
    async (loginValue: string, password: string, rememberMe = true) => {
      const payload = await loginRequest(loginValue, password, rememberMe);
      storeUser(payload.user);
      setUser(payload.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      bootstrapping,
      login,
      logout,
    }),
    [user, bootstrapping, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
