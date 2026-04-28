import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "editor" | "viewer";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const ensureAccountRecords = async (user: User | undefined) => {
    if (!user) return;

    const displayName =
      typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : user.email;

    await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        email: user.email,
        display_name: displayName,
      },
      { onConflict: "user_id" },
    );

    await supabase.from("user_roles").upsert(
      { user_id: user.id, role: "viewer" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  };

  const loadRoles = async (uid: string | undefined) => {
    if (!uid) {
      setRoles([]);
      return;
    }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles(((data ?? []) as { role: AppRole }[]).map((r) => r.role));
  };

  useEffect(() => {
    // Set up listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // Defer Supabase calls to avoid deadlock
      setTimeout(() => {
        void ensureAccountRecords(newSession?.user).finally(() => {
          void loadRoles(newSession?.user.id);
        });
      }, 0);
    });

    // Then check current session
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void ensureAccountRecords(data.session?.user)
        .finally(() => loadRoles(data.session?.user.id))
        .finally(() => setLoading(false));
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    roles,
    loading,
    isStaff: roles.includes("admin") || roles.includes("editor"),
    isAdmin: roles.includes("admin"),
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshRoles: async () => loadRoles(session?.user.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
