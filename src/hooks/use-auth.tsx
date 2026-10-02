import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

// Mirrors the columns on public.user_permissions (minus bookkeeping fields).
export interface Permissions {
  catalogue_write: boolean;
  catalogue_approve: boolean;
  fournisseurs_write: boolean;
  bids_write: boolean;
  bids_export: boolean;
  view_purchase_prices: boolean;
}
export type PermissionKey = keyof Permissions;

export interface AuthCtx {
  user: User;
  isAdmin: boolean;
  permissions: Permissions;
  /** true if the user is admin OR holds this specific permission */
  can: (perm: PermissionKey) => boolean;
}
export const AuthContext = createContext<AuthCtx | null>(null);
export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
