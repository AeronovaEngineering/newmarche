// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { confidenceFromScore, offerLabels, scoreCandidates, type ProduitCand, type ScoredCandidate } from "./matching";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Cloudflare Workers (free tier) enforces TWO independent caps per request:
//  - 10ms of CPU time (wall-clock spent AWAITING the AI call or the database
//    does NOT count — only synchronous JS execution does)
//  - 50 outgoing subrequests (every fetch() counts as one — including every
//    Supabase REST call AND every AI gateway call)
// The deterministic scoring loop can blow the CPU budget on a big catalogue;
// the per-line AI call + per-line DB writes can independently blow the
// subrequest budget on a big marché even when scoring is cheap — that second
// limit is why "most chapters returned nothing": at ~3 subrequests/line
// (1 AI call + 2 writes), the Worker hit 50 around line 16 on every chunk,
// every time, regardless of CPU time left.
// Fix: batch the per-line DB writes into two bulk calls per chunk (instead of
// two calls PER LINE), and stop the loop on whichever budget is hit first.
const CPU_BUDGET_MS = 7;
const SUBREQUEST_BUDGET = 40; // cap the loop itself at 40, leaving headroom under 50 for the 2 setup queries + the 2 bulk writes after the loop

async function llmPick(line: { designation: string; unite: string | null; quantite: number }, cands: ScoredCandidate[], key: string) {
  const list = cands.map((c, i) => ({
    idx: i, produit: c.designation, score: c.score, specs: c.notes.join(", "),
    offres: c.offres.map((o) => ({ id: o.id, fournisseur: o.fournisseur_nom, prix: o.prix_fourniture, delai: o.delai_livraison_jours, fiabilite: o.note_fiabilite })),
  }));
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "Tu es un métreur MEP tunisien. Pour une ligne de bordereau, choisis le produit catalogue équivalent parmi les candidats (pré-classés par score déterministe) puis l'offre fournisseur la plus pertinente (prix bas, délai, fiabilité). Si aucun candidat ne correspond techniquement (diamètre, pression, puissance différents ou autre produit), réponds idx=-1 et confiance 'none'. Justification: une phrase courte en français citant les specs." },
        { role: "user", content: JSON.stringify({ ligne: line, candidats: list }) },
      ],
      tools: [{ type: "function", function: { name: "choisir", description: "Choix final", parameters: {
        type: "object", properties: {
          idx: { type: "integer" }, offre_id: { type: "string" },
          confiance: { type: "string", enum: ["high", "medium", "low", "none"] }, justification: { type: "string" },
        }, required: ["idx", "confiance", "justification"], additionalProperties: false } } }],
      tool_choice: { type: "function", function: { name: "choisir" } },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  return JSON.parse(args ?? "{}") as { idx: number; offre_id?: string; confiance: "high" | "medium" | "low" | "none"; justification: string };
}

export const matchLignes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    marcheId: z.string().uuid(),
    ligneIds: z.array(z.string().uuid()).optional(), // explicit subset (e.g. "Relancer" on one line) — takes priority over chapitreId
    chapitreId: z.string().uuid().optional(),         // scope a full-marché run to one chapter at a time
    cursor: z.number().int().min(0).default(0),       // index to resume from within this scope, across calls
    useAi: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: canEdit } = await sb.rpc("has_perm", { _user_id: context.userId, _perm: "bids_write" });
    if (!canEdit) throw new Error("Droits insuffisants");

    const { data: marche } = await sb.from("marches").select("id, chantiers(marge_defaut_pct)").eq("id", data.marcheId).single(); // subrequest #1
    const marge = Number((marche as any)?.chantiers?.marge_defaut_pct ?? 20);

    let q = sb.from("marche_lignes").select("id, designation, unite, quantite, statut").eq("marche_id", data.marcheId).order("ordre");
    if (data.ligneIds) q = q.in("id", data.ligneIds); // explicit array, even empty — never falls through to "whole marché" on a falsy length
    else {
      q = q.neq("statut", "verifie");
      if (data.chapitreId) q = q.eq("chapitre_id", data.chapitreId);
    }
    const { data: allLignes, error: le } = await q; // subrequest #2
    if (le) throw new Error(le.message);
    const total = allLignes?.length ?? 0;

    const { data: prods, error: pe } = await sb.from("produits") // subrequest #3
      .select("id, designation, unite_reference, specs, categories(nom), fournisseur_produits(id, produit_id, fournisseur_id, prix_fourniture, delai_livraison_jours, date_maj, disponibilite, fournisseurs(nom, note_fiabilite, actif))");
    if (pe) throw new Error(pe.message);
    const t0cat = performance.now();
    const catalogue: ProduitCand[] = (prods ?? []).map((p: any) => ({
      id: p.id, designation: p.designation, unite_reference: p.unite_reference, specs: p.specs ?? {}, category_nom: p.categories?.nom,
      offres: (p.fournisseur_produits ?? []).filter((o: any) => o.fournisseurs?.actif !== false && o.disponibilite !== "rupture").map((o: any) => ({
        id: o.id, produit_id: o.produit_id, fournisseur_id: o.fournisseur_id, fournisseur_nom: o.fournisseurs?.nom ?? "?",
        prix_fourniture: Number(o.prix_fourniture), delai_livraison_jours: o.delai_livraison_jours, date_maj: o.date_maj, note_fiabilite: o.fournisseurs?.note_fiabilite,
      })),
    }));
    let cpuUsed = performance.now() - t0cat; // mapping the catalogue is itself synchronous CPU work, charged once per chunk
    let subreqs = 3; // the three queries above

    const key = process.env["LOVABLE_API_KEY"];
    let failures = 0, i = data.cursor;
    const bidUpserts: any[] = [];
    const statutUpdates: { id: string; statut: string }[] = [];
    for (; i < total; i++) {
      const l = allLignes![i];
      const tScore = performance.now();
      const cands = scoreCandidates(l, catalogue, 5);
      cpuUsed += performance.now() - tScore;

      let chosenIdx = cands.length ? 0 : -1;
      let conf = confidenceFromScore(cands[0]?.score ?? 0);
      let just = cands[0] ? `Score déterministe ${cands[0].score} (${cands[0].notes.join(", ") || "texte"})` : "Aucun candidat catalogue";
      let offreId: string | undefined;
      if (data.useAi && key && cands.length) {
        try {
          const pick = await llmPick({ designation: l.designation, unite: l.unite, quantite: Number(l.quantite) }, cands, key); // 1 subrequest, awaited I/O not charged to cpuUsed
          subreqs++;
          chosenIdx = pick.idx; conf = pick.confiance; just = pick.justification; offreId = pick.offre_id;
        } catch (e) { subreqs++; failures++; console.error(e); }
      }

      const tPost = performance.now();
      const top = chosenIdx >= 0 ? cands[chosenIdx] : undefined;
      const ordered = top ? [top, ...cands.filter((c) => c !== top)] : cands;
      const candidats = ordered.slice(0, 3).map((c) => ({
        produit_id: c.produit_id, designation: c.designation, score: c.score, text: c.text, spec: c.spec, unit: c.unit, notes: c.notes,
        offres: c.offres, labels: offerLabels(c.offres),
      }));
      const offre = top ? (top.offres.find((o) => o.id === offreId) ?? [...top.offres].sort((a, b) => a.prix_fourniture - b.prix_fourniture)[0]) : undefined;
      const prixAchat = offre?.prix_fourniture ?? null;

      // Queued, not written yet — this is what cuts subrequests from 2×N lines to 2 total per chunk.
      bidUpserts.push({
        marche_ligne_id: l.id,
        fournisseur_produit_id: offre?.id ?? null,
        prix_achat: prixAchat,
        marge_pct: marge,
        prix_unitaire: prixAchat != null ? Math.round(prixAchat * (1 + marge / 100) * 1000) / 1000 : null,
        source: data.useAi && key ? "ia" : "score",
        confiance: top ? conf : "none",
        justification: just,
        candidats,
        verified_by: null, verified_at: null,
        updated_at: new Date().toISOString(),
      });
      statutUpdates.push({ id: l.id, statut: offre ? "suggestion_ia" : "non_rempli" });
      cpuUsed += performance.now() - tPost;

      if (cpuUsed >= CPU_BUDGET_MS || subreqs >= SUBREQUEST_BUDGET) { i++; break; } // always at least this one line, even if it alone exceeded a budget
    }

    if (bidUpserts.length) {
      await sb.from("bid_lignes").upsert(bidUpserts, { onConflict: "marche_ligne_id" }); // 1 subrequest regardless of how many lines were queued
      // Partial-column upsert: PostgREST only touches the columns present in each row (id + statut here),
      // so this is a safe bulk "update statut for many ids", not a destructive overwrite of the rest of the row.
      await sb.from("marche_lignes").upsert(statutUpdates, { onConflict: "id" }); // 1 subrequest
    }
    const nextCursor = i < total ? i : null;
    await sb.from("activity_log").insert({ user_id: context.userId, action: "match_ia_chunk", entity: "marches", entity_id: data.marcheId, details: { done: bidUpserts.length, failures, cursor: data.cursor, nextCursor, chapitreId: data.chapitreId ?? null } });
    return { done: bidUpserts.length, failures, total, nextCursor };
  });
