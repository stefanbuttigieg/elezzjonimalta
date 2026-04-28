import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Landmark,
  Map as MapIcon,
  Users,
  ClipboardList,
  ShieldCheck,
  LogOut,
  FileText,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const items = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/review", label: "Pending review", icon: ClipboardList },
  { to: "/admin/candidates", label: "Candidates", icon: Users },
  { to: "/admin/parties", label: "Parties", icon: Landmark },
  { to: "/admin/districts", label: "Districts", icon: MapIcon },
  { to: "/admin/proposals", label: "Proposals", icon: FileText },
  { to: "/admin/roles", label: "User roles", icon: ShieldCheck, adminOnly: true },
];

function AdminLayout() {
  const { session, loading, isStaff, isAdmin, user, signOut, roles, refreshRoles } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth/login" });
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) return null;

  if (!isStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
          <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 font-serif text-2xl font-bold text-foreground">Access restricted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account ({user?.email}) is signed in but has no editorial role.
            An admin must grant you the <span className="font-semibold">editor</span> or{" "}
            <span className="font-semibold">admin</span> role.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => void refreshRoles()}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Retry
            </button>
            <button
              onClick={() => signOut()}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Sign out
            </button>
            <Link
              to="/"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Back to site
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
        <div className="px-5 py-6">
          <Link to="/" className="font-serif text-lg font-bold tracking-tight text-foreground">
            Vot Malta <span className="text-muted-foreground">Admin</span>
          </Link>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            {roles.join(" · ") || "no role"}
          </p>
        </div>
        <nav className="px-3 pb-6">
          {items
            .filter((i) => !i.adminOnly || isAdmin)
            .map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    "mt-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/80 hover:bg-accent hover:text-foreground")
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
        </nav>
        <div className="px-3">
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 px-4 py-8 md:px-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
