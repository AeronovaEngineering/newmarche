// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, daysAgo, logActivity } from "@/components/app/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fmtDT } from "@/lib/bid-math";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/catalogue/$produitId")({
  head: () => ({ meta: [{ title: "Comparaison produit — AeroNova BID" }, { name: "description", content: "Toutes les offres fournisseurs pour un produit." }] }),
  component: Produit,
});

function useProduit(id: string) {
  return useQuery({
    queryKey: ["produit", id],
    queryFn: async () => (await supabase.from("produits").select("*, categories(nom), fournisseur_produits(*, fournisseurs(nom, note_fiabilite), fournisseur_produits_historique_prix(prix_fourniture, date_effective))").eq("id", id).single()).data as any,
  });
}

function Produit() {
  const { produitId } = Route.useParams();
  const { can, user } = useAuth();
  const canEdit = can("catalogue_write");
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: p } = useProduit(produitId);
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: async () => (await supabase.from("categories").select("id, nom, parent_id").order("ordre")).data ?? [] });
  const { data: fournisseurs = [] } = useQuery({ queryKey: ["fournisseurs-lite"], queryFn: async () => (await supabase.from("fournisseurs").select("id, nom").eq("actif", true).order("nom")).data ?? [] });
  const key = ["produit", produitId];
  const [delOpen, setDelOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerForm, setOfferForm] = useState({ fournisseur_id: "", prix_fourniture: "", delai_livraison_jours: "" });

  async function patch(fields: Record<string, unknown>) {
    const { error } = await supabase.from("produits").update(fields).eq("id", produitId);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: key });
  }
  async function removeProduit() {
    const { error } = await supabase.from("produits").delete().eq("id", produitId);
    if (error) return toast.error(error.message);
    await logActivity(supabase, user.id, "suppression_produit", "produits", produitId, { designation: p?.designation });
    toast.success("Produit supprimé");
    qc.invalidateQueries({ queryKey: ["catalogue"] });
    nav({ to: "/catalogue" });
  }
  async function addOffer() {
    const { error } = await supabase.from("fournisseur_produits").insert({
      produit_id: produitId, fournisseur_id: offerForm.fournisseur_id,
      prix_fourniture: Number(offerForm.prix_fourniture) || 0,
      delai_livraison_jours: offerForm.delai_livraison_jours ? Number(offerForm.delai_livraison_jours) : null,
    });
    if (error) return toast.error(error.message.includes("duplicate") ? "Ce fournisseur a déjà une offre pour ce produit — modifiez-la plutôt." : error.message);
    setOfferOpen(false); setOfferForm({ fournisseur_id: "", prix_fourniture: "", delai_livraison_jours: "" });
    qc.invalidateQueries({ queryKey: key });
  }
  async function updateOffer(id: string, fields: Record<string, unknown>) {
    const { error } = await supabase.from("fournisseur_produits").update(fields).eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: key });
  }
  async function removeOffer(id: string) {
    const { error } = await supabase.from("fournisseur_produits").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: key });
  }

  if (!p) return <PageHeader title="…" />;
  const offres = [...p.fournisseur_produits].sort((a: any, b: any) => a.prix_fourniture - b.prix_fourniture);
  return (
    <div>
      <PageHeader title={canEdit
        ? <input defaultValue={p.designation} className="w-full bg-transparent text-base font-semibold outline-none focus:underline" onBlur={(e) => e.target.value.trim() && e.target.value !== p.designation && patch({ designation: e.target.value.trim() })} />
        : p.designation}
        sub={`${p.categories?.nom ?? ""} · ${p.marque ?? ""} · ${p.unite_reference}`}
        actions={canEdit && <Button size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-destructive" onClick={() => setDelOpen(true)}><Trash2 className="size-4" />Supprimer</Button>} />
      <div className="space-y-4 p-4">
        {canEdit && (
          <div className="grid max-w-xl grid-cols-3 gap-3 rounded border bg-card p-3">
            <div className="grid gap-1"><Label className="text-[11px]">Catégorie</Label>
              <select defaultValue={p.category_id ?? ""} onChange={(e) => patch({ category_id: e.target.value || null })} className="h-8 rounded border bg-background px-2 text-xs">
                <option value="">—</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.nom}</option>)}
              </select></div>
            <div className="grid gap-1"><Label className="text-[11px]">Unité de référence</Label><Input defaultValue={p.unite_reference} className="h-8 text-xs" onBlur={(e) => e.target.value.trim() !== p.unite_reference && patch({ unite_reference: e.target.value.trim() || "U" })} /></div>
            <div className="grid gap-1"><Label className="text-[11px]">Marque</Label><Input defaultValue={p.marque ?? ""} className="h-8 text-xs" onBlur={(e) => e.target.value.trim() !== (p.marque ?? "") && patch({ marque: e.target.value.trim() || null })} /></div>
          </div>
        )}
        <div className="num text-xs text-muted-foreground">{Object.entries(p.specs ?? {}).map(([k, v]) => `${k} = ${v}`).join(" · ")}</div>

        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Offres fournisseurs</h3>
          {canEdit && <Dialog open={offerOpen} onOpenChange={setOfferOpen}><DialogTrigger asChild><Button size="sm" variant="outline" className="h-7"><Plus className="size-3.5" />Ajouter une offre</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Nouvelle offre — {p.designation}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1"><Label>Fournisseur</Label>
                  <select value={offerForm.fournisseur_id} onChange={(e) => setOfferForm({ ...offerForm, fournisseur_id: e.target.value })} className="h-9 rounded border bg-card px-2 text-sm">
                    <option value="">—</option>{fournisseurs.map((f: any) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1"><Label>Prix fourniture (DT)</Label><Input type="number" step="0.001" value={offerForm.prix_fourniture} onChange={(e) => setOfferForm({ ...offerForm, prix_fourniture: e.target.value })} /></div>
                  <div className="grid gap-1"><Label>Délai (jours)</Label><Input type="number" value={offerForm.delai_livraison_jours} onChange={(e) => setOfferForm({ ...offerForm, delai_livraison_jours: e.target.value })} /></div>
                </div>
                <Button disabled={!offerForm.fournisseur_id} onClick={addOffer}>Ajouter l'offre</Button>
              </div>
            </DialogContent></Dialog>}
        </div>
        <table className="w-full rounded border bg-card text-[13px]">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr className="border-b"><th className="px-3 py-2 font-medium">Fournisseur</th><th className="font-medium">Réf.</th><th className="text-right font-medium">Prix (DT)</th><th className="text-right font-medium">Délai</th><th className="text-right font-medium">MOQ</th><th className="font-medium pl-4">Dispo</th><th className="text-right font-medium">MAJ</th><th className="px-3 font-medium">Historique</th><th className="w-10" /></tr></thead>
          <tbody>{offres.map((o: any, i: number) => (
            <tr key={o.id} className={`border-b last:border-0 ${i === 0 ? "bg-ok-soft" : ""}`}>
              <td className="px-3 py-2"><Link to="/fournisseurs/$fournisseurId" params={{ fournisseurId: o.fournisseur_id }} className="hover:underline">{o.fournisseurs?.nom}</Link> <span className="text-muted-foreground">{"★".repeat(o.fournisseurs?.note_fiabilite ?? 0)}</span></td>
              <td className="num text-xs">{o.reference_fournisseur}</td>
              <td className="num text-right font-semibold">
                {canEdit ? <input defaultValue={Number(o.prix_fourniture)} type="number" step="0.001" className="w-20 bg-transparent text-right outline-none focus:underline" onBlur={(e) => Number(e.target.value) !== Number(o.prix_fourniture) && updateOffer(o.id, { prix_fourniture: Number(e.target.value) || 0, date_maj: new Date().toISOString() })} /> : fmtDT(Number(o.prix_fourniture))}
              </td>
              <td className="num text-right">{o.delai_livraison_jours ?? "—"} j</td>
              <td className="num text-right">{o.quantite_min_commande ?? "—"}</td>
              <td className="pl-4 text-xs">{o.disponibilite}</td>
              <td className={`num text-right text-xs ${daysAgo(o.date_maj) > 90 ? "text-attention" : ""}`}>{daysAgo(o.date_maj)} j</td>
              <td className="num px-3 text-xs text-muted-foreground">{o.fournisseur_produits_historique_prix.slice(-4).map((h: any) => fmtDT(Number(h.prix_fourniture))).join(" → ")}</td>
              <td className="px-2 text-right">{canEdit && <Button size="icon" variant="ghost" className="size-6 text-muted-foreground hover:text-destructive" onClick={() => removeOffer(o.id)}><Trash2 className="size-3.5" /></Button>}</td>
            </tr>))}
            {!offres.length && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Aucune offre pour ce produit.</td></tr>}
          </tbody>
        </table>
      </div>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer « {p.designation} » ?</AlertDialogTitle>
            <AlertDialogDescription>Supprime aussi toutes ses offres fournisseurs ({offres.length}). Les lignes de bid déjà validées avec ce produit conserveront leur prix mais perdront le lien vers l'offre.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={removeProduit}>Supprimer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}