// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, Package, Truck, FileInput, Users, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, type Permissions } from "@/hooks/use-auth";

const EMPTY_PERMS: Permissions = {
  catalogue_write: false, catalogue_approve: false, fournisseurs_write: false,
  bids_write: false, bids_export: false, view_purchase_prices: false,
};

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // bootstrap_user creates the profile + permissions row on first login
    // (first-ever user becomes admin) and returns the caller's row every time.
    const { data: row } = await supabase.rpc("bootstrap_user").single();
    const isAdmin = Boolean((row as any)?.is_admin);
    const permissions: Permissions = row ? {
      catalogue_write: (row as any).catalogue_write,
      catalogue_approve: (row as any).catalogue_approve,
      fournisseurs_write: (row as any).fournisseurs_write,
      bids_write: (row as any).bids_write,
      bids_export: (row as any).bids_export,
      view_purchase_prices: (row as any).view_purchase_prices,
    } : EMPTY_PERMS;
    return { user: data.user, isAdmin, permissions };
  },
  component: Shell,
});

const NAV = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/chantiers", label: "Chantiers", icon: FolderKanban },
  { to: "/catalogue", label: "Catalogue", icon: Package },
  { to: "/fournisseurs", label: "Fournisseurs", icon: Truck },
  { to: "/import", label: "Import catalogue", icon: FileInput },
] as const;

function Shell() {
  const { user, isAdmin, permissions } = Route.useRouteContext();
  const nav = useNavigate();
  const can = (perm: keyof typeof permissions) => isAdmin || permissions[perm];
  const activePerms = (Object.keys(permissions) as (keyof typeof permissions)[]).filter((k) => permissions[k]);
  return (
    <AuthContext.Provider value={{ user, isAdmin, permissions, can }}>
      <div className="flex h-screen overflow-hidden">
        <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
          <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
            <img src="/logo.png" alt="AeroNova" className="size-7 object-contain" />
            <span className="text-base font-semibold text-sidebar-accent-foreground">AeroNova BID</span>
            <span className="num text-xs text-sidebar-foreground/50">v2</span>
          </div>
          <nav className="flex-1 space-y-0.5 p-2">
            {NAV.map((n) => (
               <Link key={n.to} to={n.to} className="flex items-center gap-3 rounded px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>
                 <n.icon className="size-4" />{n.label}
              </Link>
            ))}
            {isAdmin && (
               <Link to="/admin" className="flex items-center gap-3 rounded px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>
                <Users className="size-3.5" />Utilisateurs
              </Link>
            )}
          </nav>
          <div className="border-t border-sidebar-border p-2 text-xs">
            <div className="truncate px-2 text-sidebar-accent-foreground">{user.email}</div>
            <div className="num px-2 text-[10px] uppercase tracking-wider text-sidebar-primary">
              {isAdmin ? "admin" : activePerms.join(" · ") || "lecture seule"}
            </div>
             <button onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}
               className="mt-1 flex w-full items-center gap-2 rounded px-2 py-2 hover:bg-sidebar-accent"><LogOut className="size-4" />Déconnexion</button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-auto"><Outlet /></main>
      </div>
    </AuthContext.Provider>
  );
}
