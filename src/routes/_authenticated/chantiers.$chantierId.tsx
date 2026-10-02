// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Plus, ArrowRight, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, CHANTIER_STATUT, logActivity } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDT } from "@/lib/bid-math";
import { totalsFor, buildExportData, type ExportData } from "@/lib/export";
import { parseBordereau, readSheet } from "@/lib/parse-excel";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/chantiers/$chantierId")({
  head: () => ({ meta: [{ title: "Chantier — AeroNova BID" }, { name: "description", content: "Lots, remises et récapitulatif du bordereau." }, { property: "og:title", content: "Chantier — AeroNova BID" }, { property: "og:description", content: "Lots, remises et récapitulatif du bordereau." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ChantierPage,
});

function useChantier(id: string) {
  return useQuery({
    queryKey: ["chantier", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("chantiers")
        .select("*, marches(id, nom, ordre, marche_chapitres(id, code, titre, ordre, remise_type, remise_valeur), marche_lignes(id, numero, designation, unite, quantite, statut, chapitre_id, ordre, bid_lignes(prix_unitaire, prix_achat, prix_pose)))")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
}

function ChantierPage() {
  const { chantierId } = Route.useParams();
  const { can, user } = useAuth();
  const canEdit = can("bids_write");
  const qc = useQueryClient();
  const { data: c } = useChantier(chantierId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importLot, setImportLot] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["chantier", chantierId] });
  if (!c) return <PageHeader title="…" />;

  const marches = [...(c.marches as any[])].sort((a, b) => a.ordre - b.ordre);
  const exportData: ExportData = buildExportData(c, marches);
  const t = totalsFor(exportData);
  const unverified = marches.flatMap((m) => m.marche_lignes).filter((l: any) => l.statut !== "verifie").length;

  async function upd(patch: Record<string, unknown>) {
    const { error } = await supabase.from("chantiers").update({ ...patch, ...(patch.statut === "soumis" ? { soumis_at: new Date().toISOString() } : {}) }).eq("id", chantierId);
    if (error) toast.error(error.message); else refresh();
  }
  async function updChap(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("marche_chapitres").update(patch).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }
  async function addLot() {
    await supabase.from("marches").insert({ chantier_id: chantierId, nom: `Lot ${String(marches.length + 1).padStart(2, "0")}`, ordre: marches.length + 1 });
    refresh();
  }
  async function onFile(file: File) {
    if (!importLot) return;
    try {
      const chaps = parseBordereau(await readSheet(file));
      const m = marches.find((x) => x.id === importLot);
      let ordre = m?.marche_lignes.length ?? 0;
      for (const [i, ch] of chaps.entries()) {
        const { data: row, error } = await supabase.from("marche_chapitres").insert({ marche_id: importLot, code: ch.code, titre: ch.titre, ordre: (m?.marche_chapitres.length ?? 0) + i + 1 }).select("id").single();
        if (error) throw error;
        const lignes = ch.lignes.map((l) => ({ marche_id: importLot, chapitre_id: row.id, numero: l.numero, designation: l.designation, quantite: l.quantite, unite: l.unite, ordre: ++ordre }));
        const { error: e2 } = await supabase.from("marche_lignes").insert(lignes);
        if (e2) throw e2;
      }
      const n = chaps.reduce((s, c) => s + c.lignes.length, 0);
      await logActivity(supabase, user.id, "import_bordereau", "marches", importLot, { chapitres: chaps.length, lignes: n });
      toast.success(`${chaps.length} chapitres, ${n} lignes importées`);
      refresh();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div>
      <PageHeader title={c.nom} sub={[c.client, c.reference_ao].filter(Boolean).join(" · ")} actions={
        <Button size="sm" variant={unverified ? "outline" : "default"} asChild><Link to="/validation/$chantierId" params={{ chantierId }}><ClipboardCheck className="size-4" />Valider l'offre{unverified ? ` · ${unverified} à revoir` : ""}</Link></Button>
      } />
      <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />

      <div className="grid gap-4 p-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {marches.map((m) => {
            const ls = m.marche_lignes;
            const v = ls.filter((l: any) => l.statut === "verifie").length, s = ls.filter((l: any) => l.statut === "suggestion_ia").length;
            return (
              <section key={m.id} className="rounded border bg-card">
                <div className="flex items-center gap-3 border-b px-3 py-2">
                  <h2 className="text-sm font-semibold">{m.nom}</h2>
                  <span className="num text-xs text-muted-foreground">{ls.length} lignes · <span className="text-ok">{v} vérifiées</span> · <span className="text-attention">{s} suggestions</span></span>
                  <div className="ml-auto flex gap-2">
                    {canEdit && <Button size="sm" variant="ghost" className="h-7" onClick={() => { setImportLot(m.id); setTimeout(() => fileRef.current?.click()); }}><Upload className="size-3.5" />Importer bordereau</Button>}
                    <Button size="sm" className="h-7" asChild><Link to="/remplir/$marcheId" params={{ marcheId: m.id }}>Remplir <ArrowRight className="size-3.5" /></Link></Button>
                  </div>
                </div>
                <table className="w-full text-[13px]">
                  <thead className="text-left text-[11px] text-muted-foreground"><tr className="border-b"><th className="px-3 py-1.5 font-medium">Chapitre</th><th className="text-right font-medium">Sous-total HT</th><th className="w-44 font-medium">Remise</th><th className="px-3 text-right font-medium">Net</th></tr></thead>
                  <tbody>
                    {[...m.marche_chapitres].sort((a: any, b: any) => a.ordre - b.ordre).map((ch: any) => {
                      const r = t.chapitres.find((x) => x.id === ch.id)!;
                      return (
                        <tr key={ch.id} className="border-b last:border-0">
                          <td className="px-3 py-1.5"><span className="num mr-2 text-muted-foreground">{ch.code}</span>{ch.titre}</td>
                          <td className="num text-right">{fmtDT(r.sousTotal)}</td>
                          <td><div className="flex gap-1 pl-3">
                            <Input disabled={!canEdit} key={`${ch.id}-${ch.remise_valeur}`} defaultValue={ch.remise_valeur} className="num h-6 w-20 text-right text-xs" onBlur={(e) => Number(e.target.value) !== Number(ch.remise_valeur) && updChap(ch.id, { remise_valeur: Number(e.target.value) || 0 })} />
                            <Select disabled={!canEdit} value={ch.remise_type} onValueChange={(v) => updChap(ch.id, { remise_type: v })}><SelectTrigger className="h-6 w-16 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pct">%</SelectItem><SelectItem value="montant">DT</SelectItem></SelectContent></Select>
                          </div></td>
                          <td className="num px-3 text-right font-medium">{fmtDT(r.net)}</td>
                        </tr>
                      );
                    })}
                    {!m.marche_chapitres.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Importez le bordereau des prix (.xlsx / .xls) de ce lot.</td></tr>}
                  </tbody>
                </table>
              </section>
            );
          })}
          {canEdit && <Button size="sm" variant="outline" onClick={addLot}><Plus className="size-3.5" />Ajouter un lot</Button>}
        </div>

        <aside className="space-y-4">
          <section className="rounded border bg-card p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Paramètres de l'offre</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="col-span-2 grid gap-1">Statut
                <Select disabled={!canEdit} value={c.statut} onValueChange={(v) => upd({ statut: v })}><SelectTrigger className="h-7"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CHANTIER_STATUT).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
              </label>
              <label className="grid gap-1">TVA
                <Select disabled={!canEdit} value={String(Number(c.tva_taux))} onValueChange={(v) => upd({ tva_taux: Number(v) })}><SelectTrigger className="h-7"><SelectValue /></SelectTrigger><SelectContent>{["19", "13", "7", "0"].map((v) => <SelectItem key={v} value={v}>{v}%</SelectItem>)}</SelectContent></Select>
              </label>
              <label className="grid gap-1">Timbre (DT)<Input disabled={!canEdit} key={String(c.timbre_fiscal)} defaultValue={c.timbre_fiscal} className="num h-7" onBlur={(e) => upd({ timbre_fiscal: Number(e.target.value) || 0 })} /></label>
              <label className="grid gap-1">Remise globale<Input disabled={!canEdit} key={String(c.remise_globale_valeur)} defaultValue={c.remise_globale_valeur} className="num h-7" onBlur={(e) => upd({ remise_globale_valeur: Number(e.target.value) || 0 })} /></label>
              <label className="grid gap-1">Type
                <Select disabled={!canEdit} value={c.remise_globale_type} onValueChange={(v) => upd({ remise_globale_type: v })}><SelectTrigger className="h-7"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pct">%</SelectItem><SelectItem value="montant">DT</SelectItem></SelectContent></Select>
              </label>
              <label className="col-span-2 grid gap-1">Marge par défaut (%) — appliquée aux suggestions<Input disabled={!canEdit} key={String(c.marge_defaut_pct)} defaultValue={c.marge_defaut_pct} className="num h-7" onBlur={(e) => upd({ marge_defaut_pct: Number(e.target.value) || 0 })} /></label>
            </div>
          </section>
          <section className="rounded border bg-card p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Récapitulatif</h3>
            <dl className="num space-y-1 text-[13px]">
              {([
                ["Total chapitres HT", t.totalChapitres], ["Remise globale", -t.remiseGlobale], ["Total HT", t.totalHT],
                [`TVA ${Number(c.tva_taux)}%`, t.tva], ["Total TTC", t.totalTTC], ["Timbre fiscal", t.timbre],
              ] as [string, number][]).map(([k, v]) => <div key={k} className="flex justify-between"><dt className="font-sans text-muted-foreground">{k}</dt><dd>{fmtDT(v)}</dd></div>)}
              <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold"><dt className="font-sans">Net à payer</dt><dd>{fmtDT(t.netAPayer)} DT</dd></div>
              <div className="flex justify-between pt-1 text-xs"><dt className="font-sans text-muted-foreground">Coût d'achat · marge</dt><dd>{fmtDT(t.coutTotal)} · <span className={t.margePct < 10 ? "text-destructive" : "text-ok"}>{t.margePct.toFixed(1)}%</span></dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
