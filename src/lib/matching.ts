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
const TOKEN_CACHE = new Map<string, string[]>();
export function tokens(s: string): string[] {
  // Memoized: the same catalogue strings are re-tokenized for every line otherwise (NFD + regex = costly on Workers' 10ms CPU cap).
  let t = TOKEN_CACHE.get(s);
  if (!t) {
    t = normalize(s).split(" ").filter((x) => x.length > 1 && !STOP.has(x));
    if (TOKEN_CACHE.size > 5000) TOKEN_CACHE.clear();
    TOKEN_CACHE.set(s, t);
  }
  return t;
}

// Reusable rows: avoids allocating two arrays per character of `a`.
let ROW_A = new Uint16Array(256), ROW_B = new Uint16Array(256);
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length < b.length) { const t = a; a = b; b = t; } // distance is symmetric; keep the row on the shorter string
  const m = a.length, n = b.length;
  if (!n) return m;
  if (n + 1 > ROW_A.length) { ROW_A = new Uint16Array(n + 1); ROW_B = new Uint16Array(n + 1); }
  let prev = ROW_A, cur = ROW_B;
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const del = prev[j] + 1, ins = cur[j - 1] + 1, sub = prev[j - 1] + (ai === b.charCodeAt(j - 1) ? 0 : 1);
      cur[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
    }
    const t = prev; prev = cur; cur = t;
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

/** Upper bound of ratio(a,b) from lengths alone (Levenshtein >= |len diff|). O(1). */
function ratioUB(a: string, b: string): number {
  if (!a && !b) return 1;
  return 1 - Math.abs(a.length - b.length) / Math.max(a.length, b.length);
}
/** tokenSetRatio with the three strings built once; `exact=false` returns only a cheap upper bound. */
function tokenSetParts(A: string[], B: string[]) {
  const SB = new Set(B), SA = new Set(A);
  const inter = A.filter((t) => SB.has(t)).sort();
  const dA = A.filter((t) => !SB.has(t)).sort();
  const dB = B.filter((t) => !SA.has(t)).sort();
  const i = inter.join(" ");
  return { i, s1: [i, ...dA].join(" ").trim(), s2: [i, ...dB].join(" ").trim() };
}

export function scoreCandidates(line: { designation: string; unite?: string | null }, produits: ProduitCand[], topN = 5): ScoredCandidate[] {
  const ls = parseSpecs(line.designation);
  const lu = normUnit(line.unite);
  const lineTokens = [...new Set(tokens(line.designation))];

  // Pass 1 (cheap): spec/unit scores + a length-based upper bound on the text ratio.
  // Pass 2: exact Levenshtein only for products that can still reach the top N.
  // Results are identical to scoring everything — pruned products provably score below the N-th best.
  const pre = [];
  produits.forEach((p, idx) => {
    if (!(p.offres.length > 0)) return;
    const { score: spec, notes } = specScore(ls, p.specs ?? {});
    const unit = !lu ? 0.5 : normUnit(p.unite_reference) === lu ? 1 : 0;
    const parts = tokenSetParts(lineTokens, [...new Set(tokens(`${p.designation} ${p.category_nom ?? ""}`))]);
    const ub = Math.max(ratioUB(parts.i, parts.s1), ratioUB(parts.i, parts.s2), ratioUB(parts.s1, parts.s2));
    pre.push({ p, idx, spec, notes, unit, parts, max: 0.55 * ub + 0.35 * spec + 0.1 * unit });
  });
  pre.sort((x, y) => y.max - x.max);

  const out: (ScoredCandidate & { idx: number })[] = [];
  let kth = -Infinity; // N-th best exact score so far
  for (const c of pre) {
    if (out.length >= topN && c.max < kth - 0.001) break; // sorted by bound: nothing after can qualify
    const { i, s1, s2 } = c.parts;
    const text = Math.max(ratio(i, s1), ratio(i, s2), ratio(s1, s2));
    const score = Math.round((0.55 * text + 0.35 * c.spec + 0.1 * c.unit) * 1000) / 1000;
    out.push({ produit_id: c.p.id, designation: c.p.designation, score, text, spec: c.spec, unit: c.unit, notes: c.notes, offres: c.p.offres, idx: c.idx });
    if (out.length >= topN) {
      out.sort((a, b) => b.score - a.score || a.idx - b.idx);
      out.length = topN;
      kth = out[topN - 1].score;
    }
  }
  out.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return out.slice(0, topN).map(({ idx, ...r }) => r);
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