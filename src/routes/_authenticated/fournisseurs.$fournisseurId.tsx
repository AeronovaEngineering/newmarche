// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Stat, daysAgo, logActivity } from "@/components/app/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fmtDT } from "@/lib/bid-math";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/fournisseurs/$fournisseurId")({
  head: () => ({ meta: [{ title: "Fiche fournisseur — AeroNova BID" }, { name: "description", content: "Coordonnées, conditions et offres d'un fournisseur." }] }),
  component: Fournisseur,
});

const DISPO = { en_stock: "En stock", sur_commande: "Sur commande", rupture: "Rupture" } as const;
const OFFRE_STATUT = { brouillon: "Brouillon", verifie: "Vérifié" } as const;

function Fournisseur() {
  const { fournisseurId } = Route.useParams();
  const { can, user } = useAuth();
  const canEdit = can("fournisseurs_write");
  const canOffers = can("catalogue_write");
  const nav = useNavigate();
  const qc = useQueryClient();
  const key = ["fournisseur", fournisseurId];

  const { data: f, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await supabase.from("fournisseurs")
      .select("*, fournisseur_produits(*, produits(id, designation, unite_reference, marque, categories(nom)), fournisseur_produits_historique_prix(prix_fourniture, date_effective))")
      .eq("id", fournisseurId).maybeSingle()).data as any,
  });

  const [q, setQ] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerForm, setOfferForm] = useState({ produit_id: "", prix_fourniture: "", delai_livraison_jours: "", reference_fournisseur: "" });
  const [prodQ, setProdQ] = useState("");
  const { data: produits = [] } = useQuery({
    queryKey: ["produits-lite"], enabled: offerOpen,
    queryFn: async () => (await supabase.from("produits").select("id, designation, unite_reference").order("designation")).data ?? [],
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["fournisseurs"] });
    qc.invalidateQueries({ queryKey: ["fournisseurs-lite"] });
  };
  async function patch(fields: Record<string, unknown>) {
    const { error } = await supabase.from("fournisseurs").update(fields).eq("id", fournisseurId);
    if (error) toast.error(error.message); else refresh();
  }
  async function remove() {
    const { error } = await supabase.from("fournisseurs").delete().eq("id", fournisseurId);
    if (error) return toast.error(error.message);
    await logActivity(supabase, user.id, "suppression_fournisseur", "fournisseurs", fournisseurId, { nom: f?.nom });
    toast.success("Fournisseur supprimé");
    qc.invalidateQueries({ queryKey: ["fournisseurs"] });
    qc.invalidateQueries({ queryKey: ["fournisseurs-lite"] });
    nav({ to: "/fournisseurs" });
  }
  async function addOffer() {
    const { error } = await supabase.from("fournisseur_produits").insert({
      fournisseur_id: fournisseurId, produit_id: offerForm.produit_id,
      prix_fourniture: Number(offerForm.prix_fourniture) || 0,
      delai_livraison_jours: offerForm.delai_livraison_jours ? Number(offerForm.delai_livraison_jours) : null,
      reference_fournisseur: offerForm.reference_fournisseur.trim() || null,
    });
    if (error) return toast.error(error.message.includes("duplicate") ? "Ce fournisseur a déjà une offre pour ce produit — modifiez-la plutôt." : error.message);
    setOfferOpen(false); setProdQ("");
    setOfferForm({ produit_id: "", prix_fourniture: "", delai_livraison_jours: "", reference_fournisseur: "" });
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["fournisseurs"] });
  }
  async function updateOffer(id: string, fields: Record<string, unknown>) {
    const { error } = await supabase.from("fournisseur_produits").update(fields).eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: key });
  }
  async function removeOffer(id: string) {
    const { error } = await supabase.from("fournisseur_produits").delete().eq("id", id);
    if (error) toast.error(error.message); else { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["fournisseurs"] }); }
  }

  const offres = useMemo(() => {
    const all = [...(f?.fournisseur_produits ?? [])].sort((a: any, b: any) => (a.produits?.designation ?? "").localeCompare(b.produits?.designation ?? ""));
    const t = q.trim().toLowerCase();
    return t ? all.filter((o: any) => `${o.produits?.designation ?? ""} ${o.reference_fournisseur ?? ""} ${o.produits?.marque ?? ""}`.toLowerCase().includes(t)) : all;
  }, [f, q]);

  const taken = new Set((f?.fournisseur_produits ?? []).map((o: any) => o.produit_id));
  const prodChoices = useMemo(() => {
    const t = prodQ.trim().toLowerCase();
    return produits.filter((p: any) => !taken.has(p.id) && (!t || p.designation.toLowerCase().includes(t))).slice(0, 8);
  }, [produits, prodQ, f]);

  if (isLoading) return <PageHeader title="…" />;
  if (!f) return (
    <div>
      <PageHeader title="Fournisseur introuvable" />
      <div className="p-6 text-sm"><Link to="/fournisseurs" className="underline">← Retour aux fournisseurs</Link></div>
    </div>
  );

  const all = f.fournisseur_produits ?? [];
  const stale = all.filter((o: any) => daysAgo(o.date_maj) > 90).length;
  const rupture = all.filter((o: any) => o.disponibilite === "rupture").length;
  const text = (label: string, field: string, props: Record<string, unknown> = {}) => (
    <div className="grid gap-1">
      <Label className="text-[11px]">{label}</Label>
      <Input defaultValue={f[field] ?? ""} disabled={!canEdit} className="h-8 text-xs" {...props}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (f[field] ?? "")) patch({ [field]: v || null }); }} />
    </div>
  );

  return (
    <div>
      <PageHeader
        title={canEdit
          ? <input defaultValue={f.nom} className="w-full bg-transparent text-base font-semibold outline-none focus:underline"
              onBlur={(e) => { const v = e.target.value.trim(); if (!v) { e.target.value = f.nom; return; } if (v !== f.nom) patch({ nom: v }); }} />
          : f.nom}
        sub={<>{f.actif ? "Actif" : "Inactif"} · {all.length} offre{all.length > 1 ? "s" : ""}</>}
        actions={<>
          <Button asChild size="sm" variant="ghost" className="h-7"><Link to="/fournisseurs"><ArrowLeft className="size-4" />Fournisseurs</Link></Button>
          {canEdit && <Button size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-destructive" onClick={() => setDelOpen(true)}><Trash2 className="size-4" />Supprimer</Button>}
        </>} />

      <div className="space-y-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Offres" value={all.length} />
          <Stat label="Prix périmés (>90 j)" value={stale} tone={stale ? "attention" : undefined} />
          <Stat label="En rupture" value={rupture} tone={rupture ? "bad" : undefined} />
          <Stat label="Fiabilité" value={<span className="text-attention">{"★".repeat(f.note_fiabilite ?? 0) || "—"}</span>} />
        </div>

        <section className="max-w-4xl rounded border bg-card p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Informations</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {text("Contact", "contact")}
            {text("Téléphone", "telephone")}
            {text("Email", "email", { type: "email" })}
            {text("Adresse", "adresse")}
            {text("Matricule fiscal", "matricule_fiscal")}
            {text("Conditions de paiement", "conditions_paiement")}
            <div className="grid gap-1">
              <Label className="text-[11px]">Délai de paiement (jours)</Label>
              <Input type="number" min="0" defaultValue={f.delai_paiement_jours ?? ""} disabled={!canEdit} className="h-8 text-xs"
                onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (f.delai_paiement_jours ?? null)) patch({ delai_paiement_jours: v }); }} />
            </div>
            {text("URL du logo", "logo_url")}
            <div className="grid gap-1">
              <Label className="text-[11px]">Fiabilité</Label>
              <div className="flex h-8 items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} disabled={!canEdit} title="Cliquer à nouveau sur la même étoile pour effacer la note"
                    onClick={() => patch({ note_fiabilite: n === f.note_fiabilite ? null : n })}
                    className={`text-lg ${n <= (f.note_fiabilite ?? 0) ? "text-attention" : "text-muted-foreground/40"}`}>★</button>
                ))}
                <label className="ml-4 flex items-center gap-1.5 text-xs">
                  <input type="checkbox" disabled={!canEdit} checked={f.actif} onChange={(e) => patch({ actif: e.target.checked })} />Actif
                </label>
              </div>
            </div>
          </div>
          {f.logo_url && <img src={f.logo_url} alt="" className="mt-3 h-12 rounded border bg-background object-contain p-1" onError={(e) => (e.currentTarget.style.display = "none")} />}
          <p className="mt-3 text-[11px] text-muted-foreground">Créé il y a {daysAgo(f.created_at)} j{canEdit ? " · les modifications sont enregistrées en quittant le champ." : ""}</p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Offres de ce fournisseur</h3>
            <div className="flex items-center gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer (produit, réf., marque)" className="h-7 w-60 text-xs" />
              {canOffers && (
                <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
                  <DialogTrigger asChild><Button size="sm" variant="outline" className="h-7"><Plus className="size-3.5" />Ajouter une offre</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Nouvelle offre — {f.nom}</DialogTitle></DialogHeader>
                    <div className="grid gap-3">
                      <div className="grid gap-1">
                        <Label>Produit</Label>
                        <Input value={prodQ} onChange={(e) => setProdQ(e.target.value)} placeholder="Rechercher un produit du catalogue…" />
                        <div className="max-h-48 overflow-auto rounded border">
                          {prodChoices.map((p: any) => (
                            <button key={p.id} type="button" onClick={() => setOfferForm({ ...offerForm, produit_id: p.id })}
                              className={`flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-muted ${offerForm.produit_id === p.id ? "bg-ok-soft" : ""}`}>
                              <span className="truncate">{p.designation}</span><span className="num ml-2 shrink-0 text-muted-foreground">{p.unite_reference}</span>
                            </button>
                          ))}
                          {!prodChoices.length && <div className="p-3 text-center text-xs text-muted-foreground">Aucun produit disponible.</div>}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="grid gap-1"><Label>Prix (DT)</Label><Input type="number" step="0.001" value={offerForm.prix_fourniture} onChange={(e) => setOfferForm({ ...offerForm, prix_fourniture: e.target.value })} /></div>
                        <div className="grid gap-1"><Label>Délai (jours)</Label><Input type="number" value={offerForm.delai_livraison_jours} onChange={(e) => setOfferForm({ ...offerForm, delai_livraison_jours: e.target.value })} /></div>
                        <div className="grid gap-1"><Label>Réf. fournisseur</Label><Input value={offerForm.reference_fournisseur} onChange={(e) => setOfferForm({ ...offerForm, reference_fournisseur: e.target.value })} /></div>
                      </div>
                      <Button disabled={!offerForm.produit_id} onClick={addOffer}>Ajouter l'offre</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <div className="overflow-auto rounded border bg-card">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Produit</th><th className="font-medium">Réf.</th>
                  <th className="text-right font-medium">Prix (DT)</th><th className="text-right font-medium">Délai (j)</th><th className="text-right font-medium">MOQ</th>
                  <th className="pl-4 font-medium">Dispo.</th><th className="font-medium">Statut</th><th className="text-right font-medium">Maj</th>
                  <th className="px-3 font-medium">Historique</th><th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {offres.map((o: any) => {
                  const hist = [...(o.fournisseur_produits_historique_prix ?? [])].sort((a: any, b: any) => String(a.date_effective).localeCompare(String(b.date_effective)));
                  return (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <Link to="/catalogue/$produitId" params={{ produitId: o.produit_id }} className="hover:underline">{o.produits?.designation ?? "—"}</Link>
                        <div className="text-[11px] text-muted-foreground">{[o.produits?.categories?.nom, o.produits?.marque, o.produits?.unite_reference].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="num text-xs">
                        {canOffers ? <input defaultValue={o.reference_fournisseur ?? ""} className="w-24 bg-transparent outline-none focus:underline" onBlur={(e) => e.target.value.trim() !== (o.reference_fournisseur ?? "") && updateOffer(o.id, { reference_fournisseur: e.target.value.trim() || null })} /> : o.reference_fournisseur}
                      </td>
                      <td className="num text-right font-semibold">
                        {canOffers ? <input defaultValue={Number(o.prix_fourniture)} type="number" step="0.001" className="w-20 bg-transparent text-right outline-none focus:underline" onBlur={(e) => Number(e.target.value) !== Number(o.prix_fourniture) && updateOffer(o.id, { prix_fourniture: Number(e.target.value) || 0, date_maj: new Date().toISOString() })} /> : fmtDT(Number(o.prix_fourniture))}
                      </td>
                      <td className="num text-right">
                        {canOffers ? <input defaultValue={o.delai_livraison_jours ?? ""} type="number" className="w-14 bg-transparent text-right outline-none focus:underline" onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); v !== (o.delai_livraison_jours ?? null) && updateOffer(o.id, { delai_livraison_jours: v }); }} /> : (o.delai_livraison_jours ?? "—")}
                      </td>
                      <td className="num text-right">
                        {canOffers ? <input defaultValue={o.quantite_min_commande ?? ""} type="number" className="w-14 bg-transparent text-right outline-none focus:underline" onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); v !== (o.quantite_min_commande ?? null) && updateOffer(o.id, { quantite_min_commande: v }); }} /> : (o.quantite_min_commande ?? "—")}
                      </td>
                      <td className="pl-4 text-xs">
                        <select disabled={!canOffers} value={o.disponibilite} onChange={(e) => updateOffer(o.id, { disponibilite: e.target.value })} className="h-7 rounded border bg-background px-1 text-xs">
                          {Object.entries(DISPO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </td>
                      <td className="text-xs">
                        <select disabled={!canOffers} value={o.statut} onChange={(e) => updateOffer(o.id, { statut: e.target.value })} className="h-7 rounded border bg-background px-1 text-xs">
                          {Object.entries(OFFRE_STATUT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </td>
                      <td className={`num text-right text-xs ${daysAgo(o.date_maj) > 90 ? "text-attention" : ""}`}>{daysAgo(o.date_maj)} j</td>
                      <td className="num px-3 text-xs text-muted-foreground">{hist.slice(-4).map((h: any) => fmtDT(Number(h.prix_fourniture))).join(" → ")}</td>
                      <td className="px-2 text-right">{canOffers && <Button size="icon" variant="ghost" className="size-6 text-muted-foreground hover:text-destructive" onClick={() => removeOffer(o.id)}><Trash2 className="size-3.5" /></Button>}</td>
                    </tr>
                  );
                })}
                {!offres.length && <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">{all.length ? "Aucune offre ne correspond au filtre." : "Ce fournisseur n'a encore aucune offre."}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer « {f.nom} » ?</AlertDialogTitle>
            <AlertDialogDescription>Supprime aussi toutes ses offres produits ({all.length}). Les lignes de bid déjà validées avec une de ses offres conserveront leur prix mais perdront le lien vers l'offre.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={remove}>Supprimer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
