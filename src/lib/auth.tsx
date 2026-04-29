import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "editor" | "viewer";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoading: boolean;
  rolesError: string | null;
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
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const roleLoadId = useRef(0);

  const ensureProfileRecord = async (user: User | undefined | null) => {
    if (!user) return;

    const displayName =
      typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : user.email;

    try {
      const { error } = await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          email: user.email,
          display_name: displayName,
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    } catch (err) {
      console.warn("ensureProfileRecord: profiles upsert failed", err);
    }
  };

  const loadRoles = useCallback(async (uid: string | undefined | null): Promise<void> => {
    const requestId = ++roleLoadId.current;
    setRolesLoading(Boolean(uid));
    setRolesError(null);

    if (!uid) {
      setRoles([]);
      setRolesLoading(false);
      return;
    }

    for (let attempt = 0; attempt < 7; attempt += 1) {
      try {
        const { data: rpcRoles, error: rpcError } = await supabase.rpc("get_my_roles");
        if (!rpcError && Array.isArray(rpcRoles)) {
          if (roleLoadId.current !== requestId) return;
          setRoles(rpcRoles.filter((role): role is AppRole => ["admin", "editor", "viewer"].includes(role)));
          setRolesLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);
        if (error) throw error;
        if (roleLoadId.current !== requestId) return;
        setRoles(((data ?? []) as { role: AppRole }[]).map((r) => r.role));
        setRolesLoading(false);
        return;
      } catch (err) {
        console.warn(`loadRoles failed (attempt ${attempt + 1})`, err);
        if (attempt < 6) {
          const delay = Math.min(20_000, 750 * Math.pow(1.8, attempt));
          await new Promise((r) => setTimeout(r, delay));
          if (roleLoadId.current !== requestId) return;
          continue;
        }
        if (roleLoadId.current !== requestId) return;
        setRoles([]);
        setRolesError(
          err instanceof Error
            ? err.message
            : typeof err === "object" && err && "message" in err
              ? String((err as { message?: unknown }).message)
              : "Could not verify your access rights.",
        );
        setRolesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const handleSession = (newSession: Session | null) => {
      if (!mounted) return;
      setSession(newSession);
      const uid = newSession?.user?.id;
      setRoles([]);
      setRolesError(null);
      setRolesLoading(Boolean(uid));
      // Defer Supabase calls to avoid deadlock with onAuthStateChange
      setTimeout(() => {
        if (!mounted) return;
        // Load roles immediately — do not block on profile upserts
        void loadRoles(uid);
        void ensureAccountRecords(newSession?.user);
      }, 0);
    };

    // Set up listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      handleSession(newSession);
    });

    // Then check current session
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        handleSession(data.session);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    roles,
    loading,
    rolesLoading,
    rolesError,
    isStaff: roles.includes("admin") || roles.includes("editor"),
    isAdmin: roles.includes("admin"),
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshRoles: async () => loadRoles(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
