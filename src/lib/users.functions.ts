// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only user management. Creating / deleting auth users needs the service
 * role key, so everything here runs server-side; every handler first checks
 * that the CALLER is an admin (via their own RLS-bound client).
 */

const permsSchema = z.object({
  catalogue_write: z.boolean(),
  catalogue_approve: z.boolean(),
  fournisseurs_write: z.boolean(),
  bids_write: z.boolean(),
  bids_export: z.boolean(),
  view_purchase_prices: z.boolean(),
}).partial();

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Réservé aux administrateurs.");
}
async function adminClient() {
  // Dynamic import: *.functions.ts is bundled for the client, the service-role client must not be.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Last sign-in + disabled state for every auth user (not available through RLS tables). */
export const listUsersStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sa = await adminClient();
    const { data, error } = await sa.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(error.message);
    const now = Date.now();
    return (data.users ?? []).map((u: any) => ({
      id: u.id as string,
      last_sign_in_at: (u.last_sign_in_at ?? null) as string | null,
      disabled: Boolean(u.banned_until && new Date(u.banned_until).getTime() > now),
    }));
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    email: z.string().trim().email(),
    password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
    nom: z.string().trim().max(120).optional(),
    is_admin: z.boolean().default(false),
    perms: permsSchema.default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sa = await adminClient();
    const { data: created, error } = await sa.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: data.nom ? { nom: data.nom } : undefined,
    });
    if (error) throw new Error(error.message);
    const id = created.user.id;
    // profile + permissions rows are normally created by bootstrap_user on first login;
    // create them now so the user shows up (with the right rights) immediately.
    const { error: pe } = await sa.from("profiles").upsert({ id, email: data.email, nom: data.nom || null }, { onConflict: "id" });
    if (pe) throw new Error(pe.message);
    const { error: re } = await sa.from("user_permissions").upsert({ user_id: id, is_admin: data.is_admin, ...data.perms }, { onConflict: "user_id" });
    if (re) throw new Error(re.message);
    return { id };
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    nom: z.string().trim().max(120).nullable().optional(),
    email: z.string().trim().email().optional(),
    password: z.string().min(8, "Mot de passe : 8 caractères minimum").optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sa = await adminClient();
    const authPatch: Record<string, unknown> = {};
    if (data.email) { authPatch.email = data.email; authPatch.email_confirm = true; }
    if (data.password) authPatch.password = data.password;
    if (data.nom !== undefined) authPatch.user_metadata = { nom: data.nom || null };
    if (Object.keys(authPatch).length) {
      const { error } = await sa.auth.admin.updateUserById(data.id, authPatch);
      if (error) throw new Error(error.message);
    }
    const prof: Record<string, unknown> = {};
    if (data.nom !== undefined) prof.nom = data.nom || null;
    if (data.email) prof.email = data.email;
    if (Object.keys(prof).length) {
      const { error } = await sa.from("profiles").update(prof).eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setUserDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), disabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.id === context.userId) throw new Error("Vous ne pouvez pas désactiver votre propre compte.");
    const sa = await adminClient();
    const { error } = await sa.auth.admin.updateUserById(data.id, { ban_duration: data.disabled ? "876000h" : "none" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.id === context.userId) throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
    const sa = await adminClient();
    // never leave the app without an admin
    const { data: target } = await sa.from("user_permissions").select("is_admin").eq("user_id", data.id).maybeSingle();
    if (target?.is_admin) {
      const { count } = await sa.from("user_permissions").select("user_id", { count: "exact", head: true }).eq("is_admin", true).neq("user_id", data.id);
      if (!count) throw new Error("Impossible de supprimer le dernier administrateur.");
    }
    const { error } = await sa.auth.admin.deleteUser(data.id);
    if (error) {
      throw new Error(`Suppression impossible (${error.message}). L'utilisateur a probablement des données liées (chantiers, historique…) — désactivez-le à la place.`);
    }
    // in case profile / permissions rows are not removed by ON DELETE CASCADE
    await sa.from("user_permissions").delete().eq("user_id", data.id);
    await sa.from("profiles").delete().eq("id", data.id);
    return { ok: true };
  });
