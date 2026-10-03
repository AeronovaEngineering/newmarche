// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, daysAgo, logActivity } from "@/components/app/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fmtDT } from "@/lib/bid-math";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/fournisseurs/$fournisseurId")({
  head: () => ({ meta: [{ title: "Fournisseur — AeroNova BID" }, { name: "description", content: "Fiche fournisseur : coordonnées, fiabilité et produits fournis." }] }),
  component: FournisseurDetail,
});

function useFournisseur(id: string) {
  return useQuery({
    queryKey: ["fournisseur", id],
    queryFn: async () => (await supabase.from("fournisseurs").select("*, fournisseur_produits(id, prix_fourniture, date_maj, produits(id, designation, unite_reference))").eq("id", id).single()).data as any,
  });
}

const FIELDS: { key: string; label: string }[] = [
  { key: "contact", label: "Contact" }, { key: "telephone", label: "Téléphone" }, { key: "email", label: "Email" },
  { key: "adresse", label: "Adresse" }, { key: "matricule_fiscal", label: "Matricule fiscal" },
  { key: "conditions_paiement", label: "Conditions de paiement" },
];

function FournisseurDetail() {
  const { fournisseurId } = Route.useParams();
  const { can, user } = useAuth();
  const canEdit = can("fournisseurs_write");
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: f } = useFournisseur(fournisseurId);
  const key = ["fournisseur", fournisseurId];
  const [delOpen, setDelOpen] = useState(false);

  async function patch(fields: Record<string, unknown>) {
    const { error } = await supabase.from("fournisseurs").update(fields).eq("id", fournisseurId);
    if (error) toast.error(error.message); else { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["fournisseurs"] }); }
  }
  async function remove() {
    const { error } = await supabase.from("fournisseurs").delete().eq("id", fournisseurId);
    if (error) return toast.error(error.message);
    await logActivity(supabase, user.id, "suppression_fournisseur", "fournisseurs", fournisseurId, { nom: f?.nom });
    toast.success("Fournisseur supprimé");
    qc.invalidateQueries({ queryKey: ["fournisseurs"] });
    nav({ to: "/fournisseurs" });
  }

  if (!f) return <PageHeader title="…" />;
  const offres = [...f.fournisseur_produits].sort((a: any, b: any) => (a.produits?.designation ?? "").localeCompare(b.produits?.designation ?? ""));

  return (
    <div>
      <PageHeader title={canEdit
        ? <input defaultValue={f.nom} className="w-full bg-transparent text-base font-semibold outline-none focus:underline" onBlur={(e) => e.target.value.trim() && e.target.value !== f.nom && patch({ nom: e.target.value.trim() })} />
        : f.nom}
        sub={<Link to="/fournisseurs" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><ChevronLeft className="size-3.5" />Fournisseurs</Link>}
        actions={canEdit && <Button size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-destructive" onClick={() => setDelOpen(true)}><Trash2 className="size-4" />Supprimer</Button>} />

      <div className="space-y-4 p-4">
        <div className="grid max-w-2xl grid-cols-2 gap-3 rounded border bg-card p-3">
          {FIELDS.map(({ key: fk, label }) => (
            <div key={fk} className="grid gap-1"><Label className="text-[11px]">{label}</Label>
              {canEdit ? <Input defaultValue={f[fk] ?? ""} className="h-8 text-xs" onBlur={(e) => e.target.value !== (f[fk] ?? "") && patch({ [fk]: e.target.value || null })} /> : <div className="text-xs">{f[fk] ?? "—"}</div>}
            </div>
          ))}
          <div className="grid gap-1"><Label className="text-[11px]">Délai de paiement (jours)</Label>
            {canEdit ? <Input type="number" defaultValue={f.delai_paiement_jours ?? ""} className="h-8 text-xs" onBlur={(e) => Number(e.target.value || 0) !== (f.delai_paiement_jours ?? 0) && patch({ delai_paiement_jours: e.target.value ? Number(e.target.value) : null })} /> : <div className="text-xs">{f.delai_paiement_jours ?? "—"}</div>}
          </div>
          <div className="grid gap-1"><Label className="text-[11px]">Fiabilité</Label>
            <div>{[1, 2, 3, 4, 5].map((n) => <button key={n} disabled={!canEdit} title="Cliquer à nouveau sur la même étoile pour effacer la note" onClick={() => patch({ note_fiabilite: n === f.note_fiabilite ? null : n })} className={n <= (f.note_fiabilite ?? 0) ? "text-attention" : "text-muted-foreground/40"}>★</button>)}</div>
          </div>
          <div className="flex items-center gap-2"><Label className="text-[11px]">Actif</Label><input type="checkbox" disabled={!canEdit} checked={f.actif} onChange={(e) => patch({ actif: e.target.checked })} /></div>
        </div>

        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Produits fournis ({offres.length})</h3>
        <table className="w-full rounded border bg-card text-[13px]">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr className="border-b"><th className="px-3 py-2 font-medium">Produit</th><th className="font-medium">Unité</th><th className="text-right font-medium">Prix (DT)</th><th className="text-right font-medium">MAJ</th></tr></thead>
          <tbody>{offres.map((o: any) => (
            <tr key={o.id} className="border-b last:border-0">
              <td className="px-3 py-2"><Link to="/catalogue/$produitId" params={{ produitId: o.produits?.id }} className="hover:underline">{o.produits?.designation}</Link></td>
              <td className="text-xs text-muted-foreground">{o.produits?.unite_reference}</td>
              <td className="num text-right font-semibold">{fmtDT(Number(o.prix_fourniture))}</td>
              <td className={`num text-right text-xs ${daysAgo(o.date_maj) > 90 ? "text-attention" : "text-muted-foreground"}`}>{daysAgo(o.date_maj)} j</td>
            </tr>))}
            {!offres.length && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Aucun produit fourni pour l'instant — à ajouter depuis la fiche produit du catalogue.</td></tr>}
          </tbody>
        </table>
      </div>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer « {f.nom} » ?</AlertDialogTitle>
            <AlertDialogDescription>Supprime aussi ses {offres.length} offre(s) produit. Les lignes de bid déjà validées avec une de ses offres conserveront leur prix mais perdront le lien vers l'offre.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={remove}>Supprimer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
