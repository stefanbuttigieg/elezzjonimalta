import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";

export const Route = createFileRoute("/admin/roles")({
  component: RolesAdmin,
});

type Role = "admin" | "editor" | "viewer";

interface Row {
  user_id: string;
  email: string | null;
  display_name: string | null;
  roles: Role[];
}

function RolesAdmin() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("editor");

  const load = async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("user_id, email, display_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const byUser = new Map<string, Row>();
    (profiles ?? []).forEach((p: any) => {
      byUser.set(p.user_id, {
        user_id: p.user_id,
        email: p.email,
        display_name: p.display_name,
        roles: [],
      });
    });
    (roles ?? []).forEach((r: any) => {
      const row = byUser.get(r.user_id);
      if (row) row.roles.push(r.role);
    });
    setRows(Array.from(byUser.values()).sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")));
  };

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!isAdmin) {
    return (
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">User roles</h1>
        <p className="mt-3 text-sm text-muted-foreground">Only admins can manage user roles.</p>
      </div>
    );
  }

  const addRole = async () => {
    setBusy(true);
    try {
      const target = rows.find((r) => r.email?.toLowerCase() === newEmail.toLowerCase().trim());
      if (!target)
        throw new Error("No matching user. They must sign up first at /auth/login.");
      if (target.roles.includes(newRole)) throw new Error("User already has this role.");
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: target.user_id, role: newRole });
      if (error) throw error;
      toast.success(`Granted ${newRole} to ${target.email}`);
      setNewEmail("");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const removeRole = async (user_id: string, role: Role) => {
    if (!confirm(`Remove ${role} role?`)) return;
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", user_id)
      .eq("role", role);
    if (error) toast.error(error.message);
    else {
      toast.success("Role removed");
      void load();
    }
  };

  return (
    <div>
      <header>
        <h1 className="font-serif text-3xl font-bold text-foreground">User roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant editorial access to signed-up users.
        </p>
      </header>

      <section className="mt-8 rounded-xl border border-border bg-surface p-5 shadow-card">
        <h2 className="font-serif text-lg font-semibold text-foreground">Grant role</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[240px]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              User email
            </span>
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Role
            </span>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="editor">editor</option>
              <option value="admin">admin</option>
              <option value="viewer">viewer</option>
            </select>
          </label>
          <button
            onClick={addRole}
            disabled={busy || !newEmail}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" /> Grant
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The user must already have created an account via /auth/login.
        </p>
      </section>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Roles</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">
                  No users yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.user_id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {r.display_name || r.email || r.user_id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {r.roles.length === 0 ? (
                      <span className="text-xs text-muted-foreground">— no roles —</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {r.roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold"
                          >
                            {role}
                            <button
                              onClick={() => void removeRole(r.user_id, role)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={`Remove ${role}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
