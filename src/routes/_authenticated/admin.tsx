// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Power, Trash2, Dices } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, daysAgo, logActivity } from "@/components/app/kit";
import { useAuth, type PermissionKey } from "@/hooks/use-auth";
import { createUser, updateUser, setUserDisabled, deleteUser, listUsersStatus } from "@/lib/users.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Utilisateurs — AeroNova BID" }, { name: "description", content: "Gestion des utilisateurs et des permissions de l'équipe." }] }),
  component: Admin,
});

// Order shown as columns in the grid, with a short label for the header.
const PERMS: { key: PermissionKey; label: string; hint: string }[] = [
  { key: "catalogue_write", label: "Catalogue", hint: "Éditer produits, fournisseur-produits, catégories, soumettre des imports" },
  { key: "catalogue_approve", label: "Approuver import", hint: "Valider les lignes en attente de l'import catalogue vers le catalogue réel" },
  { key: "fournisseurs_write", label: "Fournisseurs", hint: "Éditer la fiche fournisseurs" },
  { key: "bids_write", label: "Chiffrage", hint: "Éditer chantiers/marchés/lignes, lancer et valider le matching" },
  { key: "bids_export", label: "Export", hint: "Exporter un bordereau chiffré en Excel / PDF" },
  { key: "view_purchase_prices", label: "Prix d'achat", hint: "Voir le prix d'achat et la marge (masqués sinon)" },
];

const genPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(12); crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join("");
};
const EMPTY_FORM = { email: "", nom: "", password: "", is_admin: false, perms: {} as Record<string, boolean> };

function Admin() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const runCreate = useServerFn(createUser);
  const runUpdate = useServerFn(updateUser);
  const runDisable = useServerFn(setUserDisabled);
  const runDelete = useServerFn(deleteUser);
  const runStatus = useServerFn(listUsersStatus);

  const { data } = useQuery({
    queryKey: ["admin-users"], enabled: isAdmin,
    queryFn: async () => {
      const [p, perms] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_permissions").select("*"),
      ]);
      return { profiles: p.data ?? [], perms: perms.data ?? [] };
    },
  });
  // last sign-in / disabled state come from the auth schema (server-only)
  const { data: status = [] } = useQuery({ queryKey: ["admin-users-status"], enabled: isAdmin, queryFn: () => runStatus() });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["admin-users-status"] }); };

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [edit, setEdit] = useState<any>(null);       // { id, nom, email, password }
  const [del, setDel] = useState<any>(null);         // profile
  const [busy, setBusy] = useState(false);

  if (!isAdmin) return <div className="p-6 text-sm">Accès réservé aux administrateurs.</div>;

  async function toggle(uid: string, perm: PermissionKey, value: boolean) {
    const { error } = await supabase.from("user_permissions").update({ [perm]: value }).eq("user_id", uid);
    if (error) toast.error(error.message); else refresh();
  }
  async function setAdmin(uid: string, value: boolean) {
    if (uid === user.id && !value) return toast.error("Vous ne pouvez pas retirer vos propres droits admin.");
    const { error } = await supabase.from("user_permissions").update({ is_admin: value }).eq("user_id", uid);
    if (error) toast.error(error.message); else refresh();
  }

  async function submitCreate() {
    setBusy(true);
    try {
      const r = await runCreate({ data: { email: form.email.trim(), nom: form.nom.trim() || undefined, password: form.password, is_admin: form.is_admin, perms: form.perms } });
      await logActivity(supabase, user.id, "creation_utilisateur", "profiles", r.id, { email: form.email.trim() });
      toast.success("Utilisateur créé — communiquez-lui son mot de passe.");
      setCreateOpen(false); setForm(EMPTY_FORM); refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function submitEdit() {
    setBusy(true);
    try {
      await runUpdate({ data: { id: edit.id, nom: edit.nom.trim() || null, email: edit.email.trim(), password: edit.password || undefined } });
      await logActivity(supabase, user.id, "modification_utilisateur", "profiles", edit.id, { email: edit.email.trim(), password_change: Boolean(edit.password) });
      toast.success("Utilisateur mis à jour"); setEdit(null); refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function toggleDisabled(p: any, disabled: boolean) {
    try {
      await runDisable({ data: { id: p.id, disabled } });
      await logActivity(supabase, user.id, disabled ? "desactivation_utilisateur" : "reactivation_utilisateur", "profiles", p.id, { email: p.email });
      toast.success(disabled ? "Compte désactivé" : "Compte réactivé"); refresh();
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove() {
    try {
      await runDelete({ data: { id: del.id } });
      await logActivity(supabase, user.id, "suppression_utilisateur", "profiles", del.id, { email: del.email });
      toast.success("Utilisateur supprimé"); setDel(null); refresh();
    } catch (e: any) { toast.error(e.message); setDel(null); }
  }

  const cb = (checked: boolean, onChange: (v: boolean) => void, disabled = false) =>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;

  return (
    <div>
      <PageHeader title="Utilisateurs & permissions" sub="Admin = accès total. Sinon, cocher les permissions accordées à chaque personne."
        actions={<Button size="sm" className="h-7" onClick={() => { setForm({ ...EMPTY_FORM, password: genPassword() }); setCreateOpen(true); }}><Plus className="size-3.5" />Nouvel utilisateur</Button>} />
      <div className="overflow-auto p-4">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-2 py-2">Utilisateur</th>
              <th className="px-2 text-center">Admin</th>
              {PERMS.map((p) => <th key={p.key} className="px-2 text-center" title={p.hint}>{p.label}</th>)}
              <th className="px-2">Dernière connexion</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {data?.profiles.map((p) => {
              const perm = data.perms.find((x) => x.user_id === p.id);
              const st = status.find((s) => s.id === p.id);
              const admin = Boolean(perm?.is_admin);
              const me = p.id === user.id;
              return (
                <tr key={p.id} className={`border-b ${st?.disabled ? "opacity-60" : ""}`}>
                  <td className="px-2 py-2">
                    <div className="font-medium">{p.nom || p.email}{me && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(vous)</span>}{st?.disabled && <span className="ml-1.5 rounded-sm border border-destructive/30 bg-destructive/10 px-1.5 py-px text-[10px] font-semibold uppercase text-destructive">désactivé</span>}</div>
                    {p.nom && <div className="text-xs text-muted-foreground">{p.email}</div>}
                  </td>
                  <td className="px-2 text-center">{cb(admin, (v) => setAdmin(p.id, v))}</td>
                  {PERMS.map((pk) => <td key={pk.key} className="px-2 text-center">{cb(admin || Boolean(perm?.[pk.key]), (v) => toggle(p.id, pk.key, v), admin)}</td>)}
                  <td className="num px-2 text-xs text-muted-foreground">{st?.last_sign_in_at ? `il y a ${daysAgo(st.last_sign_in_at)} j` : "jamais"}</td>
                  <td className="px-2 text-right">
                    <Button size="icon" variant="ghost" className="size-7" title="Modifier" onClick={() => setEdit({ id: p.id, nom: p.nom ?? "", email: p.email ?? "", password: "" })}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-7" disabled={me} title={st?.disabled ? "Réactiver" : "Désactiver"} onClick={() => toggleDisabled(p, !st?.disabled)}><Power className={`size-4 ${st?.disabled ? "text-ok" : ""}`} /></Button>
                    <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" disabled={me} title="Supprimer" onClick={() => setDel(p)}><Trash2 className="size-4" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data?.profiles.length && <p className="p-4 text-xs text-muted-foreground">Aucun utilisateur pour l'instant.</p>}
      </div>

      {/* Création */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvel utilisateur</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="grid gap-1"><Label>Nom (optionnel)</Label><Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
            </div>
            <div className="grid gap-1"><Label>Mot de passe initial</Label>
              <div className="flex gap-2"><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="num" />
                <Button type="button" variant="outline" size="icon" title="Générer" onClick={() => setForm({ ...form, password: genPassword() })}><Dices className="size-4" /></Button></div>
              <p className="text-[11px] text-muted-foreground">8 caractères minimum. Le compte est créé confirmé : communiquez-lui ce mot de passe.</p>
            </div>
            <div className="grid gap-1.5 rounded border p-3 text-xs">
              <label className="flex items-center gap-2 font-medium">{cb(form.is_admin, (v) => setForm({ ...form, is_admin: v }))}Administrateur (accès total)</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PERMS.map((pk) => <label key={pk.key} className="flex items-center gap-2" title={pk.hint}>{cb(form.is_admin || Boolean(form.perms[pk.key]), (v) => setForm({ ...form, perms: { ...form.perms, [pk.key]: v } }), form.is_admin)}{pk.label}</label>)}
              </div>
            </div>
            <Button disabled={busy || !form.email.trim() || form.password.length < 8} onClick={submitCreate}>Créer l'utilisateur</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modification */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'utilisateur</DialogTitle></DialogHeader>
          {edit && <div className="grid gap-3">
            <div className="grid gap-1"><Label>Nom</Label><Input value={edit.nom} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} /></div>
            <div className="grid gap-1"><Label>Email</Label><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            <div className="grid gap-1"><Label>Nouveau mot de passe (laisser vide pour ne pas changer)</Label>
              <div className="flex gap-2"><Input value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} className="num" />
                <Button type="button" variant="outline" size="icon" title="Générer" onClick={() => setEdit({ ...edit, password: genPassword() })}><Dices className="size-4" /></Button></div>
            </div>
            <Button disabled={busy || !edit.email.trim() || (edit.password && edit.password.length < 8)} onClick={submitEdit}>Enregistrer</Button>
          </div>}
        </DialogContent>
      </Dialog>

      {/* Suppression */}
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer « {del?.nom || del?.email} » ?</AlertDialogTitle>
            <AlertDialogDescription>Le compte et ses droits sont supprimés définitivement. Si cet utilisateur a déjà créé des chantiers ou des produits, la suppression peut être refusée : désactivez-le alors (il ne pourra plus se connecter, ses données restent).</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={remove}>Supprimer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
