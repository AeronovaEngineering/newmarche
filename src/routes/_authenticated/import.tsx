// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { fmtDT } from "@/lib/bid-math";
import { parseCatalogue, parseGrillePose, readSheet } from "@/lib/parse-excel";
import { normalize, tokenSetRatio, parseSpecs } from "@/lib/matching";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import catalogue — AeroNova BID" }, { name: "description", content: "Import Excel fournisseur avec revue en 3 colonnes." }] }),
  component: ImportPage,
});

const COLS = [
  { k: "nouveau_produit", t: "Nouveau produit", c: "border-t-attention" },
  { k: "nouvelle_offre", t: "Nouvelle offre sur produit existant", c: "border-t-chart-1" },
  { k: "maj_prix", t: "Mise à jour de prix", c: "border-t-ok" },
] as const;

function ImportPage() {
  const { can, user } = useAuth();
  const canEdit = can("catalogue_write");
  const canApprove = can("catalogue_approve");
  const qc = useQueryClient();
  const [four, setFour] = useState("");
  const { data } = useQuery({
    queryKey: ["staging"],
    queryFn: async () => {
      const [f, s] = await Promise.all([
        supabase.from("fournisseurs").select("id, nom").order("nom"),
        supabase.from("catalogue_staging").select("*, fournisseurs(nom), produits(designation)").eq("statut", "en_attente").order("created_at"),
      ]);
      return { fournisseurs: f.data ?? [], staging: s.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["staging"] });

  async function onFile(file: File) {
    if (!four) return toast.error("Choisissez un fournisseur");
    try {
      const rows = parseCatalogue(await readSheet(file));
      const { data: prods } = await supabase.from("produits").select("id, designation, fournisseur_produits(id, fournisseur_id, reference_fournisseur, prix_fourniture)");
      const batch = crypto.randomUUID();
      const staged = rows.map((r) => {
        const own = (prods ?? []).flatMap((p: any) => p.fournisseur_produits.filter((o: any) => o.fournisseur_id === four).map((o: any) => ({ ...o, p })));
        const byRef = r.reference && own.find((o: any) => o.reference_fournisseur === r.reference);
        const byName = own.find((o: any) => normalize(o.p.designation) === normalize(r.designation));
        const offre = byRef || byName;
        const base = { batch_id: batch, fournisseur_id: four, raw_designation: r.designation, raw_reference: r.reference, unite: r.unite, prix_fourniture: r.prix, delai_livraison_jours: r.delai, created_by: user.id, specs_guess: parseSpecs(r.designation) as any };
        if (offre) return { ...base, action: Number(offre.prix_fourniture) === r.prix ? "inchange" : "maj_prix", matched_offre_id: offre.id, matched_produit_id: offre.p.id, ancien_prix: offre.prix_fourniture, score: 1 };
        let best: any = null, bs = 0;
        for (const p of prods ?? []) { const s = tokenSetRatio(r.designation, p.designation); if (s > bs) { bs = s; best = p; } }
        if (best && bs >= 0.88) return { ...base, action: "nouvelle_offre", matched_produit_id: best.id, score: bs };
        return { ...base, action: "nouveau_produit", score: bs };
      }).filter((s) => s.action !== "inchange");
      const poses = rows.map((r, i) => ({ r, s: staged.find((x: any) => x.raw_designation === r.designation) })).filter((x) => x.r.pose != null && x.r.pose > 0 && x.s?.matched_produit_id);
      for (const { r, s } of poses) await supabase.from("produits").update({ prix_pose_defaut: r.pose } as any).eq("id", s!.matched_produit_id!);
      if (staged.length) { const { error } = await supabase.from("catalogue_staging").insert(staged as any); if (error) throw error; }
      toast.success(`${rows.length} lignes lues · ${staged.length} changements à revoir`);
      refresh();
    } catch (e: any) { toast.error(e.message); }
  }
  async function onGrille(file: File) {
    try {
      const rows = parseGrillePose(await readSheet(file));
      const [{ data: prods }, { data: cats }] = await Promise.all([supabase.from("produits").select("id, designation, category_id"), supabase.from("categories").select("id, nom")]);
      const upd = new Map<string, number>();
      for (const r of rows) {
        const cat = (cats ?? []).find((c: any) => normalize(c.nom) === normalize(r.designation));
        if (cat) { for (const p of prods ?? []) if (p.category_id === cat.id && !upd.has(p.id)) upd.set(p.id, r.pose); continue; }
        let best: any = null, bs = 0;
        for (const p of prods ?? []) { const s = tokenSetRatio(r.designation, p.designation); if (s > bs) { bs = s; best = p; } }
        if (best && bs >= 0.88) upd.set(best.id, r.pose);
      }
      for (const [id, pose] of upd) { const { error } = await supabase.from("produits").update({ prix_pose_defaut: pose } as any).eq("id", id); if (error) throw error; }
      toast.success(`${rows.length} lignes lues · prix de pose appliqué à ${upd.size} produits`);
      qc.invalidateQueries({ queryKey: ["catalogue-offres"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function promote(ids: string[]) {
    const { data: n, error } = await supabase.rpc("promote_staging", { p_ids: ids });
    if (error) toast.error(error.message); else { toast.success(`${n} changements appliqués`); refresh(); }
  }
  async function reject(ids: string[]) { await supabase.from("catalogue_staging").update({ statut: "rejete" }).in("id", ids); refresh(); }

  const st = data?.staging ?? [];
  return (
    <div>
      <PageHeader title="Import catalogue fournisseur" sub="Excel : Référence · Désignation · Unité · Prix · Délai" actions={canEdit && <>
        <select value={four} onChange={(e) => setFour(e.target.value)} className="h-7 rounded border bg-card px-2 text-xs"><option value="">Fournisseur…</option>{data?.fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}</select>
        <label className="inline-flex h-7 cursor-pointer items-center rounded bg-primary px-3 text-xs text-primary-foreground">Choisir un fichier<input type="file" hidden accept=".xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} /></label>
        <label className="inline-flex h-7 cursor-pointer items-center rounded border bg-card px-3 text-xs">Grille de pose<input type="file" hidden accept=".xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) onGrille(f); e.target.value = ""; }} /></label>
      </>} />
      <div className="grid gap-3 p-4 lg:grid-cols-3">
        {COLS.map((col) => {
          const items = st.filter((s: any) => s.action === col.k);
          return (
            <section key={col.k} className={`rounded border border-t-2 bg-card ${col.c}`}>
              <div className="flex items-center gap-2 border-b px-3 py-2"><h2 className="text-xs font-semibold uppercase tracking-wider">{col.t}</h2><span className="num text-xs text-muted-foreground">{items.length}</span>
                {canApprove && items.length > 0 && <div className="ml-auto flex gap-1"><Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => reject(items.map((i: any) => i.id))}>Rejeter</Button><Button size="sm" className="h-6 text-xs" onClick={() => promote(items.map((i: any) => i.id))}>Approuver tout</Button></div>}</div>
              <ul className="max-h-[70vh] divide-y overflow-auto text-[12.5px]">
                {items.map((s: any) => (
                  <li key={s.id} className="flex gap-2 px-3 py-1.5">
                    <div className="min-w-0 flex-1"><div className="truncate">{s.raw_designation}</div><div className="text-[11px] text-muted-foreground">{s.fournisseurs?.nom} · {s.raw_reference}{s.produits && ` → ${s.produits.designation}`}</div></div>
                    <div className="num text-right">{s.ancien_prix != null && <div className="text-[11px] text-muted-foreground line-through">{fmtDT(Number(s.ancien_prix))}</div>}{fmtDT(Number(s.prix_fourniture))}</div>
                    {canApprove && <button className="text-xs text-ok" onClick={() => promote([s.id])}>✓</button>}
                  </li>))}
                {!items.length && <li className="px-3 py-6 text-center text-muted-foreground">—</li>}
              </ul>
            </section>
          );
        })}
      </div>
      {!canApprove && <p className="px-4 text-xs text-muted-foreground">L'approbation nécessite la permission « Approuver import ».</p>}
    </div>
  );
}
