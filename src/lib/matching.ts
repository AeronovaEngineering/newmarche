// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
/**
 * Tier 1 deterministic scoring (isomorphic, no I/O).
 * token-set Levenshtein ratio + unit normalization + regex spec extraction.
 */

const STOP = new Set([
  "de","du","des","la","le","les","et","en","a","au","aux","pour","y","compris","fourniture","pose",
  "fournie","posee","type","avec","sur","sous","un","une","par","mm","inclus","ensemble",
]);

export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ø|⌀/g, " d").replace(/[^a-z0-9.,/ ]/g, " ").replace(/\s+/g, " ").trim();
}
export function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
export function ratio(a: string, b: string): number {
  if (!a && !b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}
/** fuzzywuzzy-style token_set_ratio in [0,1]. */
export function tokenSetRatio(a: string, b: string): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  const inter = [...A].filter((t) => B.has(t)).sort();
  const dA = [...A].filter((t) => !B.has(t)).sort();
  const dB = [...B].filter((t) => !A.has(t)).sort();
  const i = inter.join(" ");
  const s1 = [i, ...dA].join(" ").trim();
  const s2 = [i, ...dB].join(" ").trim();
  return Math.max(ratio(i, s1), ratio(i, s2), ratio(s1, s2));
}

const UNIT_ALIASES: Record<string, string> = {
  ml: "ml", "m.l": "ml", mlin: "ml", "metre lineaire": "ml", m: "ml",
  u: "u", unite: "u", un: "u", pce: "u", piece: "u", nb: "u", ens: "ens", ensemble: "ens", ft: "ft", forfait: "ft",
  m2: "m2", "m²": "m2", m3: "m3", "m³": "m3", kg: "kg",
};
export function normUnit(u?: string | null): string {
  if (!u) return "";
  const k = u.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  return UNIT_ALIASES[k] ?? k;
}

export interface Specs { diametre_mm?: number; pression_bar?: number; matiere?: string; puissance_btu?: number; capacite_kg?: number }
export function parseSpecs(designation: string): Specs {
  const s = designation.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const out: Specs = {};
  const d = s.match(/(?:ø|⌀|diametre|diam\.?|\bd|dn)\s*(\d{2,3})/) ?? s.match(/\b(\d{2,3})\s*mm\b/);
  if (d) out.diametre_mm = Number(d[1]);
  const p = s.match(/\bpn\s*(\d{1,2})/) ?? s.match(/(\d{1,2})\s*bars?\b/);
  if (p) out.pression_bar = Number(p[1]);
  const btu = s.match(/(\d{4,6})\s*btu/);
  if (btu) out.puissance_btu = Number(btu[1]);
  const kg = s.match(/(\d{1,3})\s*kg/);
  if (kg) out.capacite_kg = Number(kg[1]);
  for (const m of ["pvc", "pehd", "cuivre", "acier", "per", "inox"]) if (new RegExp(`\\b${m}\\b`).test(s)) { out.matiere = m; break; }
  return out;
}

export function specScore(line: Specs, prod: Record<string, unknown>): { score: number; notes: string[] } {
  const notes: string[] = [];
  let hits = 0, checks = 0;
  for (const k of ["diametre_mm", "pression_bar", "puissance_btu", "capacite_kg"] as const) {
    if (line[k] == null) continue;
    const pv = prod[k];
    if (pv == null) continue;
    checks++;
    if (Number(pv) === line[k]) { hits++; notes.push(`${k}=${line[k]} ✓`); }
    else notes.push(`${k} ${line[k]}≠${pv}`);
  }
  if (line.matiere && prod.matiere) {
    checks++;
    if (String(prod.matiere).toLowerCase() === line.matiere) { hits++; notes.push(`matière ${line.matiere} ✓`); }
    else notes.push(`matière ${line.matiere}≠${prod.matiere}`);
  }
  return { score: checks ? hits / checks : 0.5, notes };
}

export interface Offre {
  id: string; produit_id: string; fournisseur_id: string; fournisseur_nom: string;
  prix_fourniture: number; delai_livraison_jours: number | null; date_maj: string; note_fiabilite: number | null;
}
export interface ProduitCand {
  id: string; designation: string; unite_reference: string; specs: Record<string, unknown>;
  category_nom?: string | null; offres: Offre[];
}
export interface ScoredCandidate {
  produit_id: string; designation: string; score: number; text: number; spec: number; unit: number;
  notes: string[]; offres: Offre[];
}

export function scoreCandidates(line: { designation: string; unite?: string | null }, produits: ProduitCand[], topN = 5): ScoredCandidate[] {
  const ls = parseSpecs(line.designation);
  const lu = normUnit(line.unite);
  return produits.map((p) => {
    const text = tokenSetRatio(line.designation, `${p.designation} ${p.category_nom ?? ""}`);
    const { score: spec, notes } = specScore(ls, p.specs ?? {});
    const unit = !lu ? 0.5 : normUnit(p.unite_reference) === lu ? 1 : 0;
    const score = 0.55 * text + 0.35 * spec + 0.1 * unit;
    return { produit_id: p.id, designation: p.designation, score: Math.round(score * 1000) / 1000, text, spec, unit, notes, offres: p.offres };
  }).filter((c) => c.offres.length > 0).sort((a, b) => b.score - a.score).slice(0, topN);
}

/** Pick the "cheapest", "fastest", and "usual" (most reliable supplier) offerings. */
export function offerLabels(offres: Offre[]) {
  if (!offres.length) return { cheapest: null, fastest: null, usual: null };
  const cheapest = [...offres].sort((a, b) => a.prix_fourniture - b.prix_fourniture)[0];
  const fastest = [...offres].sort((a, b) => (a.delai_livraison_jours ?? 999) - (b.delai_livraison_jours ?? 999))[0];
  const usual = [...offres].sort((a, b) => (b.note_fiabilite ?? 0) - (a.note_fiabilite ?? 0))[0];
  return { cheapest: cheapest.id, fastest: fastest.id, usual: usual.id };
}

export function confidenceFromScore(s: number): "high" | "medium" | "low" | "none" {
  return s >= 0.8 ? "high" : s >= 0.62 ? "medium" : s >= 0.45 ? "low" : "none";
}
