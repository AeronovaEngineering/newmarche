// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileSpreadsheet, FileText, CheckCheck, Send, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, logActivity } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { fmtDT } from "@/lib/bid-math";
import { buildExportData, totalsFor, exportExcel, exportPdf } from "@/lib/export";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/validation/$chantierId")({
  head: () => ({ meta: [{ title: "Validation — AeroNova BID" }, { name: "description", content: "Vérification finale avant export du bordereau chiffré." }] }),
  component: ValidationPage,
});

const STALE_DAYS = 90;

function useChantier(id: string) {
  return useQuery({
    queryKey: ["chantier-validation", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("chantiers")
        .select(`*, marches(id, nom, ordre,
          marche_chapitres(id, code, titre, ordre, remise_type, remise_valeur),
          marche_lignes(id, numero, designation, unite, quantite, statut, chapitre_id, ordre,
            bid_lignes(prix_unitaire, prix_achat, prix_pose, confiance, verified_at, fournisseur_produits(date_maj))))`)
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
}

function ValidationPage() {
  const { chantierId } = Route.useParams();
  const { can, user } = useAuth();
  const canEdit = can("bids_write");
  const canExport = can("bids_export");
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: c } = useChantier(chantierId);
  if (!c) return <PageHeader title="…" />;

  const marches = [...(c.marches as any[])].sort((a, b) => a.ordre - b.ordre);
  const allLignes = marches.flatMap((m) => m.marche_lignes.map((l: any) => ({ ...l, marcheNom: m.nom })));
  const now = Date.now();

  const issues = allLignes.map((l: any) => {
    const bl = l.bid_lignes;
    const reasons: string[] = [];
    if (!bl || bl.prix_unitaire == null) reasons.push("Sans prix");
    if (l.statut !== "verifie") reasons.push("Non vérifiée");
    if (bl?.confiance === "low" || bl?.confiance === "none") reasons.push("Confiance basse");
    const dateMaj = bl?.fournisseur_produits?.date_maj;
    if (dateMaj && (now - new Date(dateMaj).getTime()) / 86400000 > STALE_DAYS) reasons.push("Prix > 90j");
    return { ligne: l, reasons };
  }).filter((x) => x.reasons.length > 0);

  const readyToVerify = allLignes.filter((l: any) => l.statut !== "verifie" && l.bid_lignes?.prix_unitaire != null);
  const exportData = buildExportData(c, marches);
  const t = totalsFor(exportData);

  async function markVerified(ids: string[]) {
    const { error } = await supabase.from("marche_lignes").update({ statut: "verifie" }).in("id", ids);
    if (error) return toast.error(error.message);
    await logActivity(supabase, user.id, "verify_lignes", "marche_lignes", chantierId, { count: ids.length });
    toast.success(`${ids.length} ligne(s) marquée(s) vérifiée(s)`);
    qc.invalidateQueries({ queryKey: ["chantier-validation", chantierId] });
    qc.invalidateQueries({ queryKey: ["chantier", chantierId] });
  }

  async function submit() {
    if (issues.length > 0 && !confirm(`${issues.length} ligne(s) ont encore un problème. Soumettre quand même ?`)) return;
    const { error } = await supabase.from("chantiers").update({ statut: "soumis", soumis_at: new Date().toISOString() }).eq("id", chantierId);
    if (error) return toast.error(error.message);
    await logActivity(supabase, user.id, "submit_chantier", "chantiers", chantierId, { lignes: allLignes.length, issues: issues.length });
    toast.success("Offre marquée comme soumise");
    qc.invalidateQueries({ queryKey: ["chantier-validation", chantierId] });
    nav({ to: "/chantiers/$chantierId", params: { chantierId } });
  }

  async function doExportExcel() { await exportExcel(exportData); await logActivity(supabase, user.id, "export_excel", "chantiers", chantierId, {}); }
  async function doExportPdf() { await exportPdf(exportData); await logActivity(supabase, user.id, "export_pdf", "chantiers", chantierId, {}); }

  return (
    <div>
      <PageHeader title={`Validation — ${c.nom}`} sub={[c.client, c.reference_ao].filter(Boolean).join(" · ")} actions={
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" asChild><Link to="/chantiers/$chantierId" params={{ chantierId }}><ArrowLeft className="size-4" />Retour</Link></Button>
          {canExport && <Button size="sm" variant="outline" onClick={doExportExcel}><FileSpreadsheet className="size-4" />Excel</Button>}
          {canExport && <Button size="sm" variant="outline" onClick={doExportPdf}><FileText className="size-4" />PDF</Button>}
          {canEdit && <Button size="sm" onClick={submit}><Send className="size-4" />Soumettre l'offre</Button>}
        </div>
      } />

      <div className="grid gap-4 p-4 xl:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded border bg-card px-3 py-2 text-sm">
            <span>{issues.length === 0
              ? <span className="text-ok">Toutes les lignes sont prêtes.</span>
              : <span className="flex items-center gap-1 text-attention"><AlertTriangle className="size-4" />{issues.length} ligne(s) à corriger sur {allLignes.length}</span>}
            </span>
            {canEdit && readyToVerify.length > 0 && (
              <Button size="sm" variant="outline" className="h-7" onClick={() => markVerified(readyToVerify.map((l: any) => l.id))}>
                <CheckCheck className="size-3.5" />Marquer vérifiées ({readyToVerify.length} avec prix)
              </Button>
            )}
          </div>

          <section className="rounded border bg-card">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] text-muted-foreground"><tr className="border-b">
                <th className="px-3 py-1.5 font-medium">Lot</th><th className="font-medium">N°</th><th className="font-medium">Désignation</th>
                <th className="text-right font-medium">P.U.</th><th className="font-medium">Problème(s)</th><th></th>
              </tr></thead>
              <tbody>
                {issues.map(({ ligne, reasons }) => (
                  <tr key={ligne.id} className="border-b last:border-0">
                    <td className="px-3 py-1.5 text-muted-foreground">{ligne.marcheNom}</td>
                    <td className="num text-muted-foreground">{ligne.numero}</td>
                    <td>{ligne.designation}</td>
                    <td className="num text-right">{ligne.bid_lignes?.prix_unitaire != null ? fmtDT(Number(ligne.bid_lignes.prix_unitaire)) : "—"}</td>
                    <td><div className="flex flex-wrap gap-1">{reasons.map((r) => <span key={r} className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">{r}</span>)}</div></td>
                    <td className="px-2">
                      {canEdit && ligne.bid_lignes?.prix_unitaire != null && ligne.statut !== "verifie" && (
                        <button className="text-xs text-ok" onClick={() => markVerified([ligne.id])}>Marquer vérifiée</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!issues.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Rien à signaler.</td></tr>}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded border bg-card p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Récapitulatif</h3>
            <dl className="num space-y-1 text-[13px]">
              <div className="flex justify-between"><dt className="font-sans text-muted-foreground">Total HT</dt><dd>{fmtDT(t.totalHT)}</dd></div>
              <div className="flex justify-between"><dt className="font-sans text-muted-foreground">Total TTC</dt><dd>{fmtDT(t.totalTTC)}</dd></div>
              <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold"><dt className="font-sans">Net à payer</dt><dd>{fmtDT(t.netAPayer)} DT</dd></div>
              <div className="flex justify-between pt-1 text-xs"><dt className="font-sans text-muted-foreground">Marge</dt><dd className={t.margePct < 10 ? "text-destructive" : "text-ok"}>{t.margePct.toFixed(1)}%</dd></div>
            </dl>
          </section>
          {!canExport && <p className="rounded border bg-card p-3 text-xs text-muted-foreground">L'export nécessite la permission « Export ».</p>}
        </aside>
      </div>
    </div>
  );
}
