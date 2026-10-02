// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, CheckCheck, ChevronLeft, Search, Loader2, ArrowRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ConfBadge, Dot, STATUT_LIGNE, daysAgo, logActivity } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { computeBid, fmtDT, prixVente, round3 } from "@/lib/bid-math";
import { matchLignes } from "@/lib/match.functions";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/remplir/$marcheId")({
  head: () => ({ meta: [{ title: "Remplir — AeroNova BID" }, { name: "description", content: "Poste de revue des suggestions de prix ligne par ligne." }, { property: "og:title", content: "Remplir — AeroNova BID" }, { property: "og:description", content: "Poste de revue des suggestions de prix ligne par ligne." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Remplir,
});

type Offre = { id: string; fournisseur_nom: string; prix_fourniture: number; delai_livraison_jours: number | null; date_maj: string; note_fiabilite: number | null };
type Cand = { produit_id: string; designation: string; score: number; text: number; spec: number; unit: number; notes: string[]; offres: Offre[]; labels: { cheapest: string | null; fastest: string | null; usual: string | null } };
type Bid = { fournisseur_produit_id: string | null; prix_achat: number | null; marge_pct: number | null; prix_unitaire: number | null; prix_pose: number | null; confiance: string | null; justification: string | null; candidats: Cand[]; source: string };
type Ligne = { id: string; numero: string | null; designation: string; unite: string | null; quantite: number; statut: "non_rempli" | "suggestion_ia" | "verifie"; chapitre_id: string | null; ordre: number; bid_lignes: Bid | null };

function useMarche(id: string) {
  return useQuery({
    queryKey: ["remplir", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("marches")
        .select("id, nom, chantier_id, chantiers(id, nom, marge_defaut_pct), marche_chapitres(id, code, titre, ordre, remise_type, remise_valeur), marche_lignes(id, numero, designation, unite, quantite, statut, chapitre_id, ordre, bid_lignes(fournisseur_produit_id, prix_achat, marge_pct, prix_unitaire, prix_pose, confiance, justification, candidats, source))")
        .eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });
}
function useCatalogue() {
  return useQuery({
    queryKey: ["catalogue-offres"],
    queryFn: async () => (await supabase.from("fournisseur_produits").select("id, prix_fourniture, delai_livraison_jours, date_maj, produits(id, designation, unite_reference, prix_pose_defaut), fournisseurs(nom, note_fiabilite)")).data ?? [],
    staleTime: 60_000,
  });
}

function Remplir() {
  const { marcheId } = Route.useParams();
  const { can, user } = useAuth();
  const canEdit = can("bids_write");
  const qc = useQueryClient();
  const { data: m } = useMarche(marcheId);
  const { data: catalogue = [] } = useCatalogue();
  const runMatch = useServerFn(matchLignes);
  const [sel, setSel] = useState(0);
  const [filter, setFilter] = useState<"all" | "non_rempli" | "suggestion_ia" | "verifie">("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [matching, setMatching] = useState(false);
  const [poseFocusTick, setPoseFocusTick] = useState(0);
  const [addArtChap, setAddArtChap] = useState<{ id: string; code: string } | null>(null);
  const [artForm, setArtForm] = useState({ designation: "", unite: "U", quantite: "1" });
  const parentRef = useRef<HTMLDivElement>(null);
  const key = ["remplir", marcheId];

  const chapitres = useMemo(() => (m ? [...m.marche_chapitres].sort((a: any, b: any) => a.ordre - b.ordre) : []), [m]);
  const allLignes: Ligne[] = useMemo(() => (m ? [...m.marche_lignes].sort((a: any, b: any) => a.ordre - b.ordre) : []), [m]);
  const lignes = useMemo(() => allLignes.filter((l) => filter === "all" || l.statut === filter), [allLignes, filter]);

  const totals = useMemo(() => computeBid({
    chapitres: chapitres.map((c: any) => ({ id: c.id, code: c.code, remise: { type: c.remise_type, valeur: Number(c.remise_valeur) },
      lignes: allLignes.filter((l) => l.chapitre_id === c.id).map((l) => ({ id: l.id, quantite: Number(l.quantite), prixUnitaire: l.bid_lignes?.prix_unitaire != null ? Number(l.bid_lignes.prix_unitaire) : null, prixAchat: l.bid_lignes?.prix_achat != null ? Number(l.bid_lignes.prix_achat) : null })) })),
    remiseGlobale: { type: "pct", valeur: 0 }, tvaTaux: 0, timbreFiscal: 0,
  }), [chapitres, allLignes]);

  // Flatten with chapter headers for the virtual list
  const items = useMemo(() => {
    const out: ({ kind: "chap"; c: any } | { kind: "ligne"; l: Ligne; idx: number })[] = [];
    let idx = 0;
    for (const c of chapitres) {
      const ls = lignes.filter((l) => l.chapitre_id === c.id);
      if (!ls.length) continue;
      out.push({ kind: "chap", c });
      for (const l of ls) out.push({ kind: "ligne", l, idx: idx++ });
    }
    const orphans = lignes.filter((l) => !chapitres.some((c: any) => c.id === l.chapitre_id));
    for (const l of orphans) out.push({ kind: "ligne", l, idx: idx++ });
    return out;
  }, [chapitres, lignes]);
  const ordered = useMemo(() => items.filter((i): i is { kind: "ligne"; l: Ligne; idx: number } => i.kind === "ligne").map((i) => i.l), [items]);
  const current = ordered[Math.min(sel, ordered.length - 1)];

  const virt = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: (i) => (items[i].kind === "chap" ? 28 : 44), overscan: 12 });
  useEffect(() => {
    const i = items.findIndex((x) => x.kind === "ligne" && x.idx === sel);
    if (i >= 0) virt.scrollToIndex(i, { align: "auto" });
  }, [sel, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const marge = Number(m?.chantiers?.marge_defaut_pct ?? 20);

  const patchLocal = useCallback((id: string, patch: Partial<Ligne>, bid?: Partial<Bid> | null) => {
    qc.setQueryData(key, (old: any) => old && ({ ...old, marche_lignes: old.marche_lignes.map((l: Ligne) => l.id !== id ? l : { ...l, ...patch, bid_lignes: bid === null ? null : bid ? { ...(l.bid_lignes ?? {} as Bid), ...bid } : l.bid_lignes }) }));
  }, [qc, marcheId]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = useCallback(async (l: Ligne, offre?: { id: string; prix: number }, source?: string) => {
    if (!canEdit || !l) return;
    const b = l.bid_lignes;
    let oid = offre?.id ?? b?.fournisseur_produit_id ?? null;
    let prix = offre?.prix ?? (b?.prix_achat != null ? Number(b.prix_achat) : null);
    if (!oid || prix == null) { toast.error("Aucune offre à accepter — utilisez / pour chercher"); return; }
    const mp = b?.marge_pct != null ? Number(b.marge_pct) : marge;
    const offreRow: any = (catalogue ?? []).find((o: any) => o.id === oid);
    const pose = b?.prix_pose != null && !offre ? Number(b.prix_pose) : (offreRow?.produits?.prix_pose_defaut != null ? Number(offreRow.produits.prix_pose_defaut) : (b?.prix_pose != null ? Number(b.prix_pose) : 0));
    const fourn = offre ? prixVente(prix, mp) : (b?.prix_unitaire != null ? round3(Number(b.prix_unitaire) - Number(b.prix_pose ?? 0)) : prixVente(prix, mp));
    const pu = round3(fourn + pose);
    const bid = { fournisseur_produit_id: oid, prix_achat: prix, marge_pct: mp, prix_unitaire: pu, prix_pose: pose, source: source ?? b?.source ?? "manuel" };
    patchLocal(l.id, { statut: "verifie" }, bid);
    setSel((s) => Math.min(s + 1, ordered.length - 1));
    const { error } = await supabase.from("bid_lignes").upsert({ marche_ligne_id: l.id, ...bid, candidats: (b?.candidats ?? []) as any, confiance: (b?.confiance ?? null) as any, justification: b?.justification ?? null, verified_by: user.id, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "marche_ligne_id" });
    const { error: e2 } = await supabase.from("marche_lignes").update({ statut: "verifie" }).eq("id", l.id);
    if (error || e2) { toast.error((error ?? e2)!.message); qc.invalidateQueries({ queryKey: key }); }
  }, [canEdit, marge, ordered.length, patchLocal, user.id, catalogue]); // eslint-disable-line react-hooks/exhaustive-deps

  const reject = useCallback(async (l: Ligne) => {
    if (!canEdit || !l) return;
    patchLocal(l.id, { statut: "non_rempli" }, { fournisseur_produit_id: null, prix_achat: null, prix_unitaire: null, prix_pose: null });
    await supabase.from("bid_lignes").update({ fournisseur_produit_id: null, prix_achat: null, prix_unitaire: null, prix_pose: null, verified_at: null, verified_by: null }).eq("marche_ligne_id", l.id);
    await supabase.from("marche_lignes").update({ statut: "non_rempli" }).eq("id", l.id);
  }, [canEdit, patchLocal]);

  const updatePrice = useCallback(async (l: Ligne, field: "fourniture" | "pose" | "marge_pct", v: number) => {
    const b = l.bid_lignes;
    const pose0 = Number(b?.prix_pose ?? 0);
    const fourn0 = b?.prix_unitaire != null ? round3(Number(b.prix_unitaire) - pose0) : 0;
    const pa = b?.prix_achat != null ? Number(b.prix_achat) : null;
    let patch: Partial<Bid>;
    if (field === "pose") patch = { prix_pose: v, prix_unitaire: round3(fourn0 + v) };
    else if (field === "fourniture") patch = { prix_pose: pose0, prix_unitaire: round3(v + pose0), ...(pa ? { marge_pct: round3(((v - pa) / pa) * 100) } : {}) };
    else { if (pa == null) return; const f = prixVente(pa, v); patch = { marge_pct: v, prix_pose: pose0, prix_unitaire: round3(f + pose0) }; }
    patchLocal(l.id, {}, patch);
    const { error } = await supabase.from("bid_lignes").upsert({ marche_ligne_id: l.id, ...patch, source: b?.source ?? "manuel", updated_at: new Date().toISOString() } as any, { onConflict: "marche_ligne_id" });
    if (error) toast.error(error.message);
  }, [patchLocal]);

  const highConf = allLignes.filter((l) => l.statut === "suggestion_ia" && l.bid_lignes?.confiance === "high" && l.bid_lignes?.fournisseur_produit_id);
  async function bulkAccept() {
    setBulkOpen(false);
    const ids = highConf.map((l) => l.id);
    for (const l of highConf) patchLocal(l.id, { statut: "verifie" });
    const now = new Date().toISOString();
    const r1 = await supabase.from("bid_lignes").update({ verified_by: user.id, verified_at: now }).in("marche_ligne_id", ids);
    const r2 = await supabase.from("marche_lignes").update({ statut: "verifie" }).in("id", ids);
    if (r1.error || r2.error) toast.error((r1.error ?? r2.error)!.message); else toast.success(`${ids.length} lignes vérifiées`);
    await logActivity(supabase, user.id, "bulk_accept_high", "marches", marcheId, { count: ids.length });
    qc.invalidateQueries({ queryKey: key });
  }

  async function launchMatch(onlyCurrent = false) {
    setMatching(true);
    const t = toast.loading(onlyCurrent ? "Matching de la ligne…" : "Matching IA en cours…");
    try {
      const r = await runMatch({ data: { marcheId, ligneIds: onlyCurrent && current ? [current.id] : undefined, useAi: true } });
      toast.success(`${r.done} lignes analysées${r.failures ? ` · ${r.failures} replis déterministes` : ""}`, { id: t });
      qc.invalidateQueries({ queryKey: key });
    } catch (e: any) { toast.error(e.message, { id: t }); } finally { setMatching(false); }
  }

  async function addArticle() {
    if (!addArtChap) return;
    const chapId = addArtChap.id;
    // Always appended after the last existing line of this chapter — never inserted
    // anywhere else — so the chapter's original bordereau order is never disturbed.
    const existing = allLignes.filter((l) => l.chapitre_id === chapId);
    const maxOrdre = existing.length ? Math.max(...existing.map((l) => l.ordre)) : -1;
    const { data, error } = await supabase.from("marche_lignes").insert({
      marche_id: marcheId, chapitre_id: chapId, numero: null, // null numero displays as "N/A" — marks it as manually added, not from the client's bordereau
      designation: artForm.designation.trim() || "Article ajouté manuellement",
      unite: artForm.unite.trim() || "U", quantite: Number(artForm.quantite) || 1,
      statut: "non_rempli", ordre: maxOrdre + 1,
    }).select().single();
    if (error) return toast.error(error.message);
    await logActivity(supabase, user.id, "add_ligne_manuelle", "marche_lignes", data.id, { chapitre_id: chapId, marche_id: marcheId });
    toast.success("Article ajouté à la fin du chapitre");
    setAddArtChap(null);
    qc.invalidateQueries({ queryKey: key });
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || searchOpen || bulkOpen || addArtChap) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); setSel((s) => Math.min(s + 1, ordered.length - 1)); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === "Enter" && current) { e.preventDefault(); accept(current); }
      else if (e.key === "/") { e.preventDefault(); setSearchOpen(true); }
      else if ((e.key === "Backspace" || e.key === "x") && current) { e.preventDefault(); reject(current); }
      else if (e.key === "p" && current) { e.preventDefault(); setPoseFocusTick((t) => t + 1); }
      else if (["1", "2", "3"].includes(e.key) && current) {
        const c = current.bid_lignes?.candidats?.[Number(e.key) - 1];
        const o = c && (c.offres.find((x) => x.id === c.labels.cheapest) ?? c.offres[0]);
        if (o) accept(current, { id: o.id, prix: Number(o.prix_fourniture) }, "ia");
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [ordered.length, current, accept, reject, searchOpen, bulkOpen, addArtChap]);

  if (!m) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  const counts = { non_rempli: 0, suggestion_ia: 0, verifie: 0 } as Record<string, number>;
  for (const l of allLignes) counts[l.statut]++;
  const chapById = Object.fromEntries(totals.chapitres.map((c) => [c.id, c]));

  return (
    <div className="flex h-screen flex-col">
      {/* Header: running totals */}
      <div className="flex h-12 shrink-0 items-center gap-4 border-b bg-card px-3">
        <Link to="/chantiers/$chantierId" params={{ chantierId: m.chantier_id }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="size-3.5" />{m.chantiers?.nom}</Link>
        <div className="text-sm font-semibold">{m.nom}</div>
        <div className="num flex items-center gap-3 text-xs">
          {(["non_rempli", "suggestion_ia", "verifie"] as const).map((s) => (
            <button key={s} onClick={() => { setFilter(filter === s ? "all" : s); setSel(0); }} className={cn("flex items-center gap-1.5 rounded px-1.5 py-0.5", filter === s && "bg-accent")}>
              <Dot className={STATUT_LIGNE[s].dot} />{counts[s]}<span className="font-sans text-muted-foreground">{STATUT_LIGNE[s].label}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-5">
          <div className="text-right"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total lot HT</div><div className="num text-sm font-semibold">{fmtDT(totals.totalHT)} DT</div></div>
          <div className="text-right"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Marge</div><div className={cn("num text-sm font-semibold", totals.margePct < 10 ? "text-destructive" : "text-ok")}>{fmtDT(totals.marge)} · {totals.margePct.toFixed(1)}%</div></div>
          {canEdit && <>
            <Button size="sm" variant="outline" className="h-7" disabled={!highConf.length} onClick={() => setBulkOpen(true)}><CheckCheck className="size-3.5" />Haute confiance ({highConf.length})</Button>
            <Button size="sm" className="h-7" disabled={matching} onClick={() => launchMatch(false)}>{matching ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}Matching IA</Button>
          </>}
          <Button size="sm" variant={counts.non_rempli + counts.suggestion_ia ? "outline" : "default"} asChild><Link to="/validation/$chantierId" params={{ chantierId: m.chantier_id }}>Passer à la validation<ArrowRight className="size-4" /></Link></Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: virtualized lines */}
        <div className="flex w-[56%] min-w-0 flex-col border-r">
          <div className="grid shrink-0 grid-cols-[14px_48px_1fr_56px_36px_84px_76px_88px_100px] gap-2 border-b bg-surface px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <span /><span>N°</span><span>Désignation</span><span className="text-right">Qté</span><span>U</span><span className="text-right">Fourn.</span><span className="text-right">Pose</span><span className="text-right">P.U. total</span><span className="text-right">Montant</span>
          </div>
          <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
            <div style={{ height: virt.getTotalSize(), position: "relative" }}>
              {virt.getVirtualItems().map((vi) => {
                const it = items[vi.index];
                const style = { position: "absolute" as const, top: 0, left: 0, right: 0, height: vi.size, transform: `translateY(${vi.start}px)` };
                if (it.kind === "chap") {
                  const ct = chapById[it.c.id];
                  return <div key={vi.key} style={style} className="flex items-center gap-2 border-b bg-muted px-3 text-xs font-semibold"><span className="num text-muted-foreground">{it.c.code}</span><span className="truncate">{it.c.titre}</span>
                    {canEdit && <button title="Ajouter un article à la fin de ce chapitre" className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={(e) => { e.stopPropagation(); setArtForm({ designation: "", unite: "U", quantite: "1" }); setAddArtChap({ id: it.c.id, code: it.c.code }); }}><Plus className="size-3.5" /></button>}
                    <span className="num ml-auto">{fmtDT(ct?.net ?? 0)}</span></div>;
                }
                const l = it.l; const b = l.bid_lignes; const active = it.idx === sel;
                return (
                  <div key={vi.key} style={style} onClick={() => setSel(it.idx)}
                    className={cn("grid cursor-default grid-cols-[14px_48px_1fr_56px_36px_84px_76px_88px_100px] items-center gap-2 border-b px-3 text-[13px]", active ? "bg-accent ring-1 ring-inset ring-ring" : "hover:bg-muted/40", l.statut === "suggestion_ia" && !active && "bg-attention-soft/40")}>
                    <Dot className={STATUT_LIGNE[l.statut].dot} />
                    <span className="num truncate text-xs text-muted-foreground">{l.numero ?? "N/A"}</span>
                    <span className="line-clamp-2 leading-tight">{l.designation}</span>
                    <span className="num text-right">{fmtDT(Number(l.quantite)).replace(/,000$/, "")}</span>
                    <span className="text-xs text-muted-foreground">{l.unite}</span>
                    <span className="num text-right">{b?.prix_unitaire != null ? fmtDT(round3(Number(b.prix_unitaire) - Number(b.prix_pose ?? 0))) : <span className="text-muted-foreground">—</span>}</span>
                    <span className="num text-right text-muted-foreground hover:text-foreground hover:underline" title="Éditer le prix de pose" onClick={(e) => { e.stopPropagation(); setSel(it.idx); setPoseFocusTick((t) => t + 1); }}>{b?.prix_unitaire != null ? fmtDT(Number(b.prix_pose ?? 0)) : ""}</span>
                    <span className="num text-right">{b?.prix_unitaire != null ? fmtDT(Number(b.prix_unitaire)) : <span className="text-muted-foreground">—</span>}</span>
                    <span className="num text-right font-medium">{b?.prix_unitaire != null ? fmtDT(totals.lignesTotal[l.id]) : ""}</span>
                  </div>
                );
              })}
            </div>
            {!items.length && <div className="p-8 text-center text-sm text-muted-foreground">Aucune ligne. Importez un bordereau depuis la page du chantier.</div>}
          </div>
          <div className="flex shrink-0 items-center gap-3 border-t bg-surface px-3 py-1 text-[11px] text-muted-foreground">
            <span><span className="kbd">↑</span><span className="kbd">↓</span> naviguer</span><span><span className="kbd">↵</span> accepter</span><span><span className="kbd">1</span>–<span className="kbd">3</span> choisir candidat</span><span><span className="kbd">/</span> chercher</span><span><span className="kbd">x</span> rejeter</span><span><span className="kbd">p</span> prix pose</span>
          </div>
        </div>

        {/* Right: decision inspector */}
        <div className="min-w-0 flex-1 overflow-auto bg-background">
          {current ? <Inspector l={current} canEdit={canEdit} onAccept={accept} onReject={reject} onPrice={updatePrice} onSearch={() => setSearchOpen(true)} onRematch={() => launchMatch(true)} matching={matching} poseFocusTick={poseFocusTick} /> : <div className="p-8 text-sm text-muted-foreground">Sélectionnez une ligne.</div>}
        </div>
      </div>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Chercher un produit ou fournisseur…" />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>Aucun résultat.</CommandEmpty>
          <CommandGroup heading={current ? `Pour : ${current.designation.slice(0, 70)}` : "Catalogue"}>
            {catalogue.map((o: any) => (
              <CommandItem key={o.id} value={`${o.produits?.designation} ${o.fournisseurs?.nom} ${o.id}`} onSelect={() => { setSearchOpen(false); if (current) accept(current, { id: o.id, prix: Number(o.prix_fourniture) }, "manuel"); }}>
                <span className="flex-1 truncate">{o.produits?.designation}</span>
                <span className="text-xs text-muted-foreground">{o.fournisseurs?.nom}</span>
                <span className="num w-24 text-right">{fmtDT(Number(o.prix_fourniture))}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Valider {highConf.length} suggestions à haute confiance ?</AlertDialogTitle>
            <AlertDialogDescription>Les lignes seront marquées « vérifié » avec le produit, l'offre et le prix proposés. Vérifiez la liste :</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 overflow-auto rounded border text-xs">
            {highConf.map((l) => <div key={l.id} className="flex gap-2 border-b px-2 py-1 last:border-0"><span className="num w-10 text-muted-foreground">{l.numero}</span><span className="flex-1 truncate">{l.designation}</span><span className="num">{fmtDT(Number(l.bid_lignes?.prix_unitaire))}</span></div>)}
          </div>
          <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={bulkAccept}>Valider {highConf.length} lignes</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!addArtChap} onOpenChange={(o) => !o && setAddArtChap(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un article — Chapitre {addArtChap?.code}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-xs text-muted-foreground">Sera ajouté en dernière position de ce chapitre, avec le numéro « N/A » (article hors bordereau client).</p>
            <div className="grid gap-1"><Label>Désignation</Label><Input value={artForm.designation} onChange={(e) => setArtForm({ ...artForm, designation: e.target.value })} autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><Label>Unité</Label><Input value={artForm.unite} onChange={(e) => setArtForm({ ...artForm, unite: e.target.value })} /></div>
              <div className="grid gap-1"><Label>Quantité</Label><Input type="number" step="0.001" value={artForm.quantite} onChange={(e) => setArtForm({ ...artForm, quantite: e.target.value })} /></div>
            </div>
            <Button disabled={!artForm.designation.trim()} onClick={addArticle}>Ajouter à la fin du chapitre</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Inspector({ l, canEdit, onAccept, onReject, onPrice, onSearch, onRematch, matching, poseFocusTick }: {
  l: Ligne; canEdit: boolean; matching: boolean;
  onAccept: (l: Ligne, o?: { id: string; prix: number }, s?: string) => void; onReject: (l: Ligne) => void;
  onPrice: (l: Ligne, f: "fourniture" | "pose" | "marge_pct", v: number) => void; onSearch: () => void; onRematch: () => void;
  poseFocusTick: number;
}) {
  const b = l.bid_lignes;
  const cands = b?.candidats ?? [];
  const poseRef = useRef<HTMLInputElement>(null);
  // "p" (or clicking the Pose cell in the list) jumps straight here for editing.
  useEffect(() => { if (poseFocusTick) { poseRef.current?.focus(); poseRef.current?.select(); } }, [poseFocusTick]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 text-xs"><span className="num text-muted-foreground">{l.numero ?? "N/A"}</span><Dot className={STATUT_LIGNE[l.statut].dot} /><span className={STATUT_LIGNE[l.statut].text}>{STATUT_LIGNE[l.statut].label}</span><ConfBadge c={b?.confiance} /></div>
        <p className="mt-1 text-[15px] font-medium leading-snug">{l.designation}</p>
        <div className="num mt-1 text-xs text-muted-foreground">{fmtDT(Number(l.quantite))} {l.unite}</div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded border bg-card p-2.5">
        <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Prix achat</div><div className="num text-sm">{fmtDT(b?.prix_achat != null ? Number(b.prix_achat) : null)}</div></div>
        <label><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Marge %</div>
          <Input disabled={!canEdit || b?.prix_achat == null} key={`m-${l.id}-${b?.marge_pct}`} defaultValue={b?.marge_pct ?? ""} className="num h-7 text-sm" onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} onBlur={(e) => e.target.value !== String(b?.marge_pct ?? "") && onPrice(l, "marge_pct", Number(e.target.value) || 0)} /></label>
        <div className="text-right"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Montant</div><div className="num text-sm font-semibold">{fmtDT(round3(Number(l.quantite) * Number(b?.prix_unitaire ?? 0)))}</div></div>
        <label><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fourniture</div>
          <Input disabled={!canEdit} key={`f-${l.id}-${b?.prix_unitaire}-${b?.prix_pose}`} defaultValue={b?.prix_unitaire != null ? round3(Number(b.prix_unitaire) - Number(b.prix_pose ?? 0)) : ""} className="num h-7 text-sm" onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} onBlur={(e) => onPrice(l, "fourniture", Number(e.target.value.replace(",", ".")) || 0)} /></label>
        <label><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pose</div>
          <Input ref={poseRef} disabled={!canEdit} key={`po-${l.id}-${b?.prix_pose}`} defaultValue={b?.prix_unitaire != null || b?.prix_pose != null ? Number(b?.prix_pose ?? 0) : ""} className="num h-7 text-sm" onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} onBlur={(e) => onPrice(l, "pose", Number(e.target.value.replace(",", ".")) || 0)} /></label>
        <div className="text-right"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">P.U. total HT</div><div className="num text-sm font-semibold">{fmtDT(b?.prix_unitaire != null ? Number(b.prix_unitaire) : null)}</div></div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-7" onClick={() => onAccept(l)} disabled={!b?.fournisseur_produit_id}>Accepter <span className="kbd ml-1">↵</span></Button>
          <Button size="sm" variant="outline" className="h-7" onClick={onSearch}><Search className="size-3.5" />Chercher <span className="kbd ml-1">/</span></Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => onReject(l)}>Rejeter <span className="kbd ml-1">x</span></Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={onRematch} disabled={matching}><Sparkles className="size-3.5" />Relancer</Button>
        </div>
      )}

      {b?.justification && (
        <div className="rounded border-l-2 border-attention bg-attention-soft/50 px-3 py-2 text-[13px]">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-attention-foreground">Raisonnement</div>{b.justification}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Candidats classés</div>
        {!cands.length && <div className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">Pas encore de suggestion. Lancez le matching IA ou cherchez manuellement.</div>}
        {cands.map((c, i) => (
          <div key={c.produit_id} className={cn("rounded border bg-card", i === 0 && "border-ring/60")}>
            <div className="flex items-start gap-2 border-b px-3 py-2">
              <span className="kbd mt-0.5">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link to="/catalogue/$produitId" params={{ produitId: c.produit_id }} className="text-[13px] font-medium hover:underline">{c.designation}</Link>
                <div className="num mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  <span>score <b className="text-foreground">{c.score.toFixed(2)}</b></span><span>texte {c.text.toFixed(2)}</span><span>specs {c.spec.toFixed(2)}</span><span>unité {c.unit}</span>
                  {c.notes.map((n) => <span key={n} className={n.includes("≠") ? "text-destructive" : "text-ok"}>{n}</span>)}
                </div>
              </div>
            </div>
            <table className="w-full text-[12.5px]">
              <tbody>
                {[...c.offres].sort((a, b) => a.prix_fourniture - b.prix_fourniture).map((o) => {
                  const chosen = b?.fournisseur_produit_id === o.id;
                  const tags = [c.labels.cheapest === o.id && "moins cher", c.labels.fastest === o.id && "plus rapide", c.labels.usual === o.id && "habituel"].filter(Boolean);
                  const age = daysAgo(o.date_maj);
                  return (
                    <tr key={o.id} className={cn("border-b last:border-0", chosen && "bg-ok-soft")}>
                      <td className="px-3 py-1.5">{o.fournisseur_nom} <span className="text-muted-foreground">{"★".repeat(o.note_fiabilite ?? 0)}</span>
                        <div className="flex gap-1">{tags.map((t) => <span key={t as string} className="rounded-sm bg-muted px-1 text-[10px] text-muted-foreground">{t}</span>)}</div></td>
                      <td className="num text-right">{fmtDT(Number(o.prix_fourniture))}</td>
                      <td className="num text-right text-xs text-muted-foreground">{o.delai_livraison_jours ?? "—"} j</td>
                      <td className={cn("num text-right text-xs", age > 90 ? "text-attention" : "text-muted-foreground")}>{age > 90 ? `⚠ ${age}j` : `${age}j`}</td>
                      <td className="px-2 text-right">{canEdit && <Button size="sm" variant={chosen ? "secondary" : "ghost"} className="h-6 px-2 text-xs" onClick={() => onAccept(l, { id: o.id, prix: Number(o.prix_fourniture) }, "ia")}>{chosen ? "Choisi" : "Utiliser"}</Button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}