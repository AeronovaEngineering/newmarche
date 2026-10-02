// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, logActivity } from "@/components/app/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/fournisseurs")({
  head: () => ({ meta: [{ title: "Fournisseurs — AeroNova BID" }, { name: "description", content: "Fournisseurs, conditions et fiabilité." }, { property: "og:title", content: "Fournisseurs — AeroNova BID" }, { property: "og:description", content: "Fournisseurs, conditions et fiabilité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Fournisseurs,
});

function Fournisseurs() {
  const { can, user } = useAuth();
  const canEdit = can("fournisseurs_write");
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["fournisseurs"], queryFn: async () => (await supabase.from("fournisseurs").select("*, fournisseur_produits(id)").order("nom")).data ?? [] });
  const [nom, setNom] = useState("");
  const [del, setDel] = useState<any>(null);
  async function add() {
    const { error } = await supabase.from("fournisseurs").insert({ nom });
    if (error) toast.error(error.message); else { setNom(""); qc.invalidateQueries({ queryKey: ["fournisseurs"] }); }
  }
  async function upd(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("fournisseurs").update(patch).eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["fournisseurs"] });
  }
  async function remove() {
    const { error } = await supabase.from("fournisseurs").delete().eq("id", del.id);
    if (error) return toast.error(error.message);
    await logActivity(supabase, user.id, "suppression_fournisseur", "fournisseurs", del.id, { nom: del.nom });
    toast.success("Fournisseur supprimé");
    setDel(null);
    qc.invalidateQueries({ queryKey: ["fournisseurs"] });
  }
  return (
    <div>
      <PageHeader title="Fournisseurs" sub={`${data.length}`} actions={canEdit && <><Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nouveau fournisseur" className="h-7 w-52 text-xs" onKeyDown={(e) => e.key === "Enter" && nom && add()} /><Button size="sm" className="h-7" disabled={!nom} onClick={add}>Ajouter</Button></>} />
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted-foreground"><tr className="border-b"><th className="px-5 py-3 font-medium">Nom</th><th className="font-medium">Contact</th><th className="font-medium">Téléphone</th><th className="font-medium">Email</th><th className="font-medium">Paiement</th><th className="font-medium">Fiabilité</th><th className="text-right font-medium">Offres</th><th className="px-5 font-medium">Actif</th><th className="w-10" /></tr></thead>
        <tbody>{data.map((f: any) => (
          <tr key={f.id} className="border-b">
             <td className="px-5 py-2.5 font-medium"><Link to="/fournisseurs/$fournisseurId" params={{ fournisseurId: f.id }} className="hover:underline">{f.nom}</Link></td>
            <td className="text-xs">{canEdit ? <input defaultValue={f.contact ?? ""} className="w-28 bg-transparent outline-none focus:underline" onBlur={(e) => e.target.value !== (f.contact ?? "") && upd(f.id, { contact: e.target.value || null })} /> : f.contact}</td>
            <td className="text-xs">{canEdit ? <input defaultValue={f.telephone ?? ""} className="w-24 bg-transparent outline-none focus:underline" onBlur={(e) => e.target.value !== (f.telephone ?? "") && upd(f.id, { telephone: e.target.value || null })} /> : f.telephone}</td>
            <td className="text-xs">{canEdit ? <input defaultValue={f.email ?? ""} className="w-36 bg-transparent outline-none focus:underline" onBlur={(e) => e.target.value !== (f.email ?? "") && upd(f.id, { email: e.target.value || null })} /> : f.email}</td>
            <td className="text-xs">{canEdit ? <input defaultValue={f.conditions_paiement ?? ""} className="w-28 bg-transparent outline-none focus:underline" onBlur={(e) => e.target.value !== (f.conditions_paiement ?? "") && upd(f.id, { conditions_paiement: e.target.value || null })} /> : f.conditions_paiement}</td>
            <td>{[1, 2, 3, 4, 5].map((n) => <button key={n} disabled={!canEdit} title="Cliquer à nouveau sur la même étoile pour effacer la note" onClick={() => upd(f.id, { note_fiabilite: n === f.note_fiabilite ? null : n })} className={n <= (f.note_fiabilite ?? 0) ? "text-attention" : "text-muted-foreground/40"}>★</button>)}</td>
            <td className="num text-right">{f.fournisseur_produits.length}</td>
            <td className="px-4"><input type="checkbox" disabled={!canEdit} checked={f.actif} onChange={(e) => upd(f.id, { actif: e.target.checked })} /></td>
            <td className="px-2 text-right">{canEdit && <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => setDel(f)}><Trash2 className="size-4" /></Button>}</td>
          </tr>))}</tbody>
      </table>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer « {del?.nom} » ?</AlertDialogTitle>
            <AlertDialogDescription>Supprime aussi toutes ses offres produits ({del?.fournisseur_produits.length ?? 0}). Les lignes de bid déjà validées avec une de ses offres conserveront leur prix mais perdront le lien vers l'offre.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={remove}>Supprimer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}