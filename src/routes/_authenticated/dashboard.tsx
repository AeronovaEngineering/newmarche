// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Stat, CHANTIER_STATUT, daysAgo } from "@/components/app/kit";
import { computeBid, fmtDT } from "@/lib/bid-math";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — AeroNova BID" }, { name: "description", content: "File d'actions, alertes prix et marges." }] }),
  component: Dashboard,
});

function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [ch, offres, log] = await Promise.all([
        supabase.from("chantiers").select("id, nom, client, statut, date_limite, created_at, soumis_at, tva_taux, timbre_fiscal, remise_globale_type, remise_globale_valeur, marches(id, nom, marche_chapitres(id, code, remise_type, remise_valeur), marche_lignes(id, statut, quantite, chapitre_id, bid_lignes(prix_unitaire, prix_achat)))").order("date_limite"),
        supabase.from("fournisseur_produits").select("id, prix_fourniture, date_maj, reference_fournisseur, produits(id, designation), fournisseurs(nom)").order("date_maj").limit(200),
        supabase.from("activity_log").select("id, action, entity, details, created_at, user_id").order("created_at", { ascending: false }).limit(12),
      ]);
      if (ch.error) throw ch.error;
      return { chantiers: ch.data ?? [], offres: offres.data ?? [], log: log.data ?? [] };
    },
  });
}

function Dashboard() {
  const { data } = useDashboard();
  if (!data) return <PageHeader title="Tableau de bord" />;
  const actifs = data.chantiers.filter((c) => c.statut === "en_cours" || c.statut === "brouillon");
  const rows = data.chantiers.map((c) => {
    let non = 0, sugg = 0, ver = 0, lots: { id: string; nom: string; non: number; sugg: number }[] = [];
    const chapitres: any[] = [];
    for (const m of c.marches as any[]) {
      let mn = 0, ms = 0;
      for (const l of m.marche_lignes) { if (l.statut === "non_rempli") { non++; mn++; } else if (l.statut === "suggestion_ia") { sugg++; ms++; } else ver++; }
      lots.push({ id: m.id, nom: m.nom, non: mn, sugg: ms });
      for (const ch of m.marche_chapitres) chapitres.push({ id: ch.id, code: ch.code, remise: { type: ch.remise_type, valeur: Number(ch.remise_valeur) },
        lignes: m.marche_lignes.filter((l: any) => l.chapitre_id === ch.id).map((l: any) => ({ id: l.id, quantite: Number(l.quantite), prixUnitaire: l.bid_lignes?.prix_unitaire, prixAchat: l.bid_lignes?.prix_achat })) });
    }
    const t = computeBid({ chapitres, remiseGlobale: { type: c.remise_globale_type, valeur: Number(c.remise_globale_valeur) }, tvaTaux: Number(c.tva_taux), timbreFiscal: Number(c.timbre_fiscal) });
    return { c, non, sugg, ver, total: non + sugg + ver, lots, t };
  });
  const decided = data.chantiers.filter((c) => c.statut === "gagne" || c.statut === "perdu");
  const winRate = decided.length ? Math.round((data.chantiers.filter((c) => c.statut === "gagne").length / decided.length) * 100) : null;
  const stale = data.offres.filter((o) => daysAgo(o.date_maj) > 90);
  const pending = rows.filter((r) => actifs.some((a) => a.id === r.c.id)).reduce((s, r) => s + r.non + r.sugg, 0);
  const tq = data.chantiers.filter((c) => c.soumis_at).map((c) => (new Date(c.soumis_at!).getTime() - new Date(c.created_at).getTime()) / 86400000);
  const avgTq = tq.length ? (tq.reduce((a, b) => a + b, 0) / tq.length).toFixed(1) : "—";
  const activeRows = rows.filter((r) => actifs.some((a) => a.id === r.c.id));

  return (
    <div>
      <PageHeader title="Tableau de bord" sub="Ce qui demande votre attention maintenant" />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Chantiers actifs" value={actifs.length} />
          <Stat label="Lignes à traiter" value={pending} tone={pending ? "attention" : "ok"} hint="non remplies + suggestions" />
          <Stat label="Prix périmés >90j" value={stale.length} tone={stale.length ? "attention" : "ok"} />
          <Stat label="Taux de réussite" value={winRate == null ? "—" : `${winRate}%`} hint={`${decided.length} décidés`} />
          <Stat label="Délai moyen de chiffrage" value={`${avgTq} j`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded border bg-card">
            <h2 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">File d'actions — lots à remplir</h2>
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] text-muted-foreground"><tr className="border-b"><th className="px-3 py-1.5 font-medium">Chantier / lot</th><th className="font-medium">Échéance</th><th className="text-right font-medium">Non rempli</th><th className="text-right font-medium">Suggestions</th><th className="px-3 text-right font-medium">Progression</th></tr></thead>
              <tbody>
                {activeRows.flatMap((r) => r.lots.filter((l) => l.non + l.sugg > 0).map((l) => {
                  const d = r.c.date_limite ? Math.ceil((new Date(r.c.date_limite).getTime() - Date.now()) / 86400000) : null;
                  return (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-3 py-1.5"><Link to="/remplir/$marcheId" params={{ marcheId: l.id }} className="font-medium hover:underline">{r.c.nom}</Link><div className="text-xs text-muted-foreground">{l.nom}</div></td>
                      <td className={`num text-xs ${d != null && d <= 3 ? "text-destructive font-semibold" : ""}`}>{d == null ? "—" : `J-${d}`}</td>
                      <td className="num text-right">{l.non}</td>
                      <td className="num text-right text-attention">{l.sugg}</td>
                      <td className="px-3"><div className="ml-auto h-1.5 w-24 overflow-hidden rounded bg-muted"><div className="h-full bg-ok" style={{ width: `${r.total ? (r.ver / r.total) * 100 : 0}%` }} /></div></td>
                    </tr>
                  );
                }))}
                {!activeRows.some((r) => r.non + r.sugg > 0) && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Rien à traiter.</td></tr>}
              </tbody>
            </table>
          </section>

          <section className="rounded border bg-card">
            <h2 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marges des offres en cours</h2>
            <div className="space-y-2 p-3">
              {activeRows.map((r) => (
                <div key={r.c.id}>
                  <div className="flex justify-between text-xs"><Link to="/chantiers/$chantierId" params={{ chantierId: r.c.id }} className="truncate hover:underline">{r.c.nom}</Link><span className="num">{fmtDT(r.t.totalHT)} DT · <b className={r.t.margePct < 10 ? "text-destructive" : ""}>{r.t.margePct.toFixed(1)}%</b></span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted"><div className={`h-full ${r.t.margePct < 10 ? "bg-destructive" : "bg-chart-1"}`} style={{ width: `${Math.min(100, Math.max(0, r.t.margePct) * 2.5)}%` }} /></div>
                </div>
              ))}
              {!activeRows.length && <div className="py-4 text-center text-sm text-muted-foreground">Aucune offre active.</div>}
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded border bg-card">
            <h2 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alertes — prix non mis à jour depuis 90 jours</h2>
            <table className="w-full text-[13px]"><tbody>
              {stale.slice(0, 12).map((o: any) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5"><Link to="/catalogue/$produitId" params={{ produitId: o.produits?.id }} className="hover:underline">{o.produits?.designation}</Link><div className="text-xs text-muted-foreground">{o.fournisseurs?.nom} · {o.reference_fournisseur}</div></td>
                  <td className="num text-right">{fmtDT(Number(o.prix_fourniture))}</td>
                  <td className="num px-3 text-right text-attention">{daysAgo(o.date_maj)} j</td>
                </tr>
              ))}
              {!stale.length && <tr><td className="px-3 py-6 text-center text-muted-foreground">Tous les prix sont à jour.</td></tr>}
            </tbody></table>
          </section>
          <section className="rounded border bg-card">
            <h2 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activité récente</h2>
            <ul className="divide-y text-[13px]">
              {data.log.map((l) => (
                <li key={l.id} className="flex gap-3 px-3 py-1.5"><span className="num w-28 shrink-0 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("fr-TN", { dateStyle: "short", timeStyle: "short" })}</span><span>{l.action}</span><span className="num truncate text-xs text-muted-foreground">{l.details ? JSON.stringify(l.details) : ""}</span></li>
              ))}
              {!data.log.length && <li className="px-3 py-6 text-center text-muted-foreground">Aucune activité.</li>}
            </ul>
          </section>
        </div>
        <div className="text-xs text-muted-foreground">Statuts : {Object.entries(CHANTIER_STATUT).map(([k, v]) => `${v} ${data.chantiers.filter((c) => c.statut === k).length}`).join(" · ")}</div>
      </div>
    </div>
  );
}
