import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
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
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Menu,
  ChevronRight,
  Home,
  Activity,
  Newspaper,
  History,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  adminOnly?: boolean;
};

const items: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/review", label: "Pending review", icon: ClipboardList },
  { to: "/admin/news", label: "News monitor", icon: Newspaper },
  { to: "/admin/sitting-mps", label: "Sitting MPs", icon: ShieldCheck },
  { to: "/admin/candidates", label: "Candidates", icon: Users },
  { to: "/admin/parties", label: "Parties", icon: Landmark },
  { to: "/admin/districts", label: "Districts", icon: MapIcon },
  { to: "/admin/proposals", label: "Proposals", icon: FileText },
  { to: "/admin/audit", label: "Audit log", icon: History },
  { to: "/admin/api-logs", label: "API logs", icon: Activity },
  { to: "/admin/roles", label: "User roles", icon: ShieldCheck, adminOnly: true },
];

function findActiveItem(pathname: string, available: NavItem[]) {
  // Pick the longest matching path
  let best: NavItem | null = null;
  for (const item of available) {
    const matches = item.exact ? pathname === item.to : pathname.startsWith(item.to);
    if (matches && (!best || item.to.length > best.to.length)) best = item;
  }
  return best;
}

function AdminLayout() {
  const {
    session,
    loading,
    rolesLoading,
    rolesError,
    isStaff,
    isAdmin,
    user,
    signOut,
    roles,
    refreshRoles,
  } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadFindings, setUnreadFindings] = useState(0);

  // Close the mobile menu whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    const load = async () => {
      const { count } = await (await import("@/integrations/supabase/client")).supabase
        .from("news_findings")
        .select("*", { count: "exact", head: true })
        .is("alert_seen_at", null)
        .eq("status", "pending");
      if (!cancelled) setUnreadFindings(count ?? 0);
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isStaff, pathname]);

  if (loading || (session && rolesLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Verifying admin access…
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
            {rolesError ? (
              <>We could not verify your editorial role because the database request failed. Please retry.</>
            ) : (
              <>
                Your account ({user?.email}) is signed in but has no editorial role.
                An admin must grant you the <span className="font-semibold">editor</span> or{" "}
                <span className="font-semibold">admin</span> role.
              </>
            )}
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

  const visibleItems = items.filter((i) => !i.adminOnly || isAdmin);
  const active = findActiveItem(pathname, visibleItems);

  const [unreadFindings, setUnreadFindings] = useState(0);
  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    const load = async () => {
      const { count } = await (await import("@/integrations/supabase/client")).supabase
        .from("news_findings")
        .select("*", { count: "exact", head: true })
        .is("alert_seen_at", null)
        .eq("status", "pending");
      if (!cancelled) setUnreadFindings(count ?? 0);
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isStaff, pathname]);

  const renderNav = (onNavigate?: () => void) => (
    <nav className="px-3 pb-6">
      {visibleItems.map((item) => {
        const isActive = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        const badge = item.to === "/admin/news" && unreadFindings > 0 ? unreadFindings : null;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={
              "mt-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors " +
              (isActive
                ? "bg-primary text-primary-foreground"
                : "text-foreground/80 hover:bg-accent hover:text-foreground")
            }
          >
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {badge ? (
              <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
        <div className="px-5 py-6">
          <Link to="/" className="font-serif text-lg font-bold tracking-tight text-foreground">
            Elezzjoni <span className="text-muted-foreground">Admin</span>
          </Link>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            {roles.join(" · ") || "no role"}
          </p>
        </div>
        {renderNav()}
        <div className="px-3">
          <Link
            to="/"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            View public site
          </Link>
          <button
            onClick={() => signOut()}
            className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky top toolbar — back/forward, breadcrumbs, mobile nav, view site */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:px-6">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open admin menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-accent md:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b border-border px-5 py-4 text-left">
                <SheetTitle className="font-serif text-base">
                  Elezzjoni <span className="text-muted-foreground">Admin</span>
                </SheetTitle>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {roles.join(" · ") || "no role"}
                </p>
              </SheetHeader>
              {renderNav(() => setMobileOpen(false))}
              <div className="border-t border-border px-3 py-3">
                <Link
                  to="/"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                  View public site
                </Link>
                <button
                  onClick={() => signOut()}
                  className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Back / forward */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Go back"
              onClick={() => router.history.back()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-accent"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Go forward"
              onClick={() => router.history.forward()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-accent"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Breadcrumbs */}
          <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground sm:flex"
          >
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-accent hover:text-foreground"
            >
              <Home className="h-3.5 w-3.5" />
              Admin
            </Link>
            {active && active.to !== "/admin" && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="truncate font-medium text-foreground">{active.label}</span>
              </>
            )}
          </nav>

          {/* Mobile-only current section title */}
          <div className="flex min-w-0 flex-1 items-center sm:hidden">
            <span className="truncate text-sm font-semibold text-foreground">
              {active?.label ?? "Admin"}
            </span>
          </div>

          {/* View public site */}
          <Link
            to="/"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">View site</span>
          </Link>
        </header>

        <main className="flex-1 px-4 py-8 md:px-10">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
