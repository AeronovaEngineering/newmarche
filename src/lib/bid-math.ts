// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
/**
 * AeroNova — pure bid/bordereau money math. SINGLE source of truth for the
 * on-screen recap, the PDF and the Excel export, so totals can never disagree.
 *
 * Strict order:
 *  line HT = qty × PU
 *  → chapter subtotal → chapter discount → net chapter
 *  → Σ net chapters → global discount → final HT
 *  → TVA → + timbre fiscal (added last, never discounted, never taxed)
 *
 * All amounts are rounded to millimes (3 decimals, DT).
 */

export type RemiseType = "pct" | "montant";
export interface Remise {
  type: RemiseType;
  valeur: number;
}

export interface LigneInput {
  id: string;
  quantite: number;
  prixUnitaire: number | null | undefined;
  prixAchat?: number | null;
}
export interface ChapitreInput {
  id: string;
  code: string;
  titre?: string | null;
  remise: Remise;
  lignes: LigneInput[];
}
export interface BidInput {
  chapitres: ChapitreInput[];
  remiseGlobale: Remise;
  tvaTaux: number; // percent, e.g. 19 or 7
  timbreFiscal: number; // DT, e.g. 1.000
}

export interface ChapitreResult {
  id: string;
  code: string;
  titre?: string | null;
  sousTotal: number;
  remise: number;
  net: number;
  cout: number;
}
export interface BidResult {
  chapitres: ChapitreResult[];
  totalChapitres: number;
  remiseGlobale: number;
  totalHT: number;
  tva: number;
  totalTTC: number;
  timbre: number;
  netAPayer: number;
  coutTotal: number;
  marge: number;
  margePct: number;
  lignesTotal: Record<string, number>;
}

export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const safe = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

/** Discount amount, capped to [0, base]. Percent clamped to [0,100]; negative values ignored. */
export function computeRemise(base: number, remise: Remise | null | undefined): number {
  if (!remise || base <= 0) return 0;
  const v = safe(remise.valeur);
  if (v <= 0) return 0;
  const raw = remise.type === "pct" ? (base * Math.min(v, 100)) / 100 : v;
  return round3(Math.min(raw, base));
}

export function lineTotal(qty: number, pu: number | null | undefined): number {
  return round3(safe(qty) * safe(pu ?? 0));
}

export function computeBid(input: BidInput): BidResult {
  const lignesTotal: Record<string, number> = {};
  let coutTotal = 0;
  const chapitres = input.chapitres.map((c) => {
    let sousTotal = 0;
    let cout = 0;
    for (const l of c.lignes) {
      const t = lineTotal(l.quantite, l.prixUnitaire);
      lignesTotal[l.id] = t;
      sousTotal += t;
      cout += lineTotal(l.quantite, l.prixAchat ?? 0);
    }
    sousTotal = round3(Math.max(0, sousTotal));
    const remise = computeRemise(sousTotal, c.remise);
    coutTotal += cout;
    return { id: c.id, code: c.code, titre: c.titre, sousTotal, remise, net: round3(sousTotal - remise), cout: round3(cout) };
  });
  const totalChapitres = round3(chapitres.reduce((s, c) => s + c.net, 0));
  const remiseGlobale = computeRemise(totalChapitres, input.remiseGlobale);
  const totalHT = round3(totalChapitres - remiseGlobale);
  const tva = round3((totalHT * Math.max(0, safe(input.tvaTaux))) / 100);
  const totalTTC = round3(totalHT + tva);
  const timbre = round3(Math.max(0, safe(input.timbreFiscal)));
  const netAPayer = round3(totalTTC + timbre);
  coutTotal = round3(coutTotal);
  const marge = round3(totalHT - coutTotal);
  const margePct = totalHT > 0 ? round3((marge / totalHT) * 100) : 0;
  return { chapitres, totalChapitres, remiseGlobale, totalHT, tva, totalTTC, timbre, netAPayer, coutTotal, marge, margePct, lignesTotal };
}

/** Selling unit price from purchase cost and margin percent. */
export function prixVente(prixAchat: number, margePct: number): number {
  return round3(safe(prixAchat) * (1 + safe(margePct) / 100));
}

const nf = new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
export const fmtDT = (n: number | null | undefined) => (n == null ? "—" : nf.format(n));
