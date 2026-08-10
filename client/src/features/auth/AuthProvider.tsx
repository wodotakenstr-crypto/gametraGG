import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { api } from "../../lib/api";
import type { Account } from "../../lib/types";

interface AuthContextValue {
  account: Account | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setAccount(await api<Account>("/auth/me"));
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function signOut() {
    await api("/auth/logout", { method: "POST" });
    setAccount(null);
  }

  return <AuthContext.Provider value={{ account, loading, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
