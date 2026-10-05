// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import * as XLSX from "xlsx";

export type Row = (string | number | null)[];

export async function readSheet(file: File): Promise<Row[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  return pickBestSheet(wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json<Row>(wb.Sheets[n], { header: 1, defval: null, raw: true }) })));
}

/** Plusieurs onglets ? On prend celui qui contient un en-tête de bordereau (Désignation + Quantité), de préférence « BP », sinon le plus fourni. */
function pickBestSheet(sheets: { name: string; rows: Row[] }[]): Row[] {
  if (!sheets.length) return [];
  const scored = sheets.map((s) => ({ ...s, hasHeader: s.rows.some((r) => detectHeader(r)), isBP: /^bp$|bordereau|prix/i.test(s.name.trim()) }));
  const pool = scored.filter((s) => s.hasHeader);
  const list = pool.length ? pool : scored;
  list.sort((a, b) => Number(b.isBP) - Number(a.isBP) || b.rows.length - a.rows.length);
  return list[0].rows;
}

const norm = (v: unknown) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
export const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[\s\u00a0\u202f]/g, "").replace(/dt|tnd|u$/gi, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", "."); // 1.200,50
  else s = s.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function findHeader(rows: Row[], matchers: Record<string, RegExp>, required: string[]) {
  for (let r = 0; r < Math.min(rows.length, 300); r++) {
    const map: Record<string, number> = {};
    rows[r].forEach((c, i) => {
      const t = norm(c);
      for (const [k, re] of Object.entries(matchers)) if (map[k] == null && re.test(t)) map[k] = i;
    });
    if (required.every((k) => map[k] != null)) return { row: r, map };
  }
  return null;
}

export interface ParsedChapitre { code: string; titre: string; lignes: ParsedLigne[] }
export interface ParsedLigne { numero: string; designation: string; quantite: number; unite: string; zone?: string; fourniture?: number | null; pose?: number | null }

/** En-têtes « pose » / « main d'œuvre » / « MO » / « installation » (accents ignorés). */
export const POSE_RE = /pose|main d.?(oe|œ)uvre|^m\.?o\.?$|installation/;

/* ------------------------------------------------------------------ */
/*  Bordereau des prix — parseur tolérant (indépendant de la mise en   */
/*  page : colonnes détectées par leurs en-têtes, lignes par contenu)  */
/* ------------------------------------------------------------------ */

type ColMap = Record<string, number>;

// Ordre = priorité : une cellule d'en-tête ne sert qu'à une seule colonne.
const HEADER_MATCHERS: [string, RegExp][] = [
  ["total", /total|montant/],
  ["des", /designation|libelle|description|ouvrage|intitule|nature des|travaux/],
  ["qte", /^(q|qte|qt|quantite|quantites|quant|nbre|nombre)(\b|\s|\.|$)/],
  ["unite", /^(u|un|unite|unit)\.?$|^unite|^uni\s*-?\s*te$/],
  ["num", /^(n[°o]?|no|num|numero|art|article|code|item|ref)(\b|\s|\.|$)/],
  ["pose", POSE_RE],
  ["prix", /^(prix|pu|p\.u|tarif)/],
];

/** Une ligne est un en-tête de bordereau si elle contient au minimum Désignation + Quantité. */
function detectHeader(row: Row): ColMap | null {
  const map: ColMap = {};
  const used = new Set<number>();
  row.forEach((c, i) => {
    const t = norm(c);
    if (!t || t.length > 80) return;
    for (const [k, re] of HEADER_MATCHERS) {
      if (map[k] == null && re.test(t) && !used.has(i)) { map[k] = i; used.add(i); break; }
    }
  });
  return map.des != null && map.qte != null ? map : null;
}

/** Pas d'en-tête reconnu : on devine les colonnes d'après le contenu (N° | Désignation | U | Qté | …). */
function inferMap(rows: Row[]): ColMap | null {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const textLen = Array(width).fill(0), numCnt = Array(width).fill(0), shortCnt = Array(width).fill(0);
  for (const r of rows) r.forEach((c, i) => {
    const s = clean(c); if (!s) return;
    if (toNum(c) != null) numCnt[i]++; else { textLen[i] += s.length; if (s.length <= 6) shortCnt[i]++; }
  });
  const des = textLen.indexOf(Math.max(...textLen));
  if (des < 0 || textLen[des] === 0) return null;
  let qte = -1, best = 0;
  for (let i = des + 1; i < width; i++) if (numCnt[i] > best) { best = numCnt[i]; qte = i; }
  if (qte < 0) return null;
  const map: ColMap = { des, qte };
  for (let i = des + 1; i < qte; i++) if (shortCnt[i] > 0) { map.unite = i; break; }
  if (des > 0) map.num = des - 1;
  return map;
}

const clean = (v: unknown): string =>
  String(v ?? "").replace(/[\u00a0\u202f]/g, " ").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n\s*/g, " ").trim();

/** Suites de points / points de suspension (« L'Unité………… ») ; retire aussi la phrase d'unité qui les précède. */
const DOT_RUN_RE = /[.…_·]{3,}/g;
const UNIT_PHRASE_RE = /^(l['’]?\s*(unit[ée]|ensemble|forfait)|le\s+(m[eè]tre(\s+(lin[ée]aire|carr[ée]|cube))?|kilogramme|kg|litre)|la\s+pi[eè]ce|la\s+s[eé]rie|le\s+lot)\s*[:\-–]?$/i;
function stripLeaders(s: string): string {
  const t = s.replace(DOT_RUN_RE, " ").replace(/\s+/g, " ").trim();
  if (!t || /^[.…_·\-–\s]+$/.test(t) || UNIT_PHRASE_RE.test(t)) return "";
  return t;
}

/** « PM » = pour mémoire (quantité non chiffrée) : importé en quantité 0, jamais ignoré. */
const PM_RE = /^\(?\s*(p\s*\.?\s*m\.?|pour\s+memoire|memoire)\s*\)?$/;
const isPM = (v: unknown) => PM_RE.test(norm(v));
/** « CHAPITRE 3 : HVAC CTA 3 » — vrai chapitre ; les I / 1 / 2 / « 1 - EQUIPEMENTS » deviennent alors des sous-parties. */
const TOP_CHAPTER_RE = /^chapitre\s+(\d+)\s*[:\-–.)]*\s*(.*)$/i;
const RECAP_RE = /^recapitulation\s+generale/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ROMAN_RE = /^[IVXLCDM]{1,7}$/;
const ITEM_CODE_RE = /^(\d+(\.\d+)+|\d+[.\-)]|[A-Z]{1,2}[.\-]\d+(\.\d+)*)\.?$/;
const INT_RE = /^\d+$/;
const TOTAL_RE = /^(s\/?\s*total|sous[\s-]*total|total|montant|t\.?v\.?a\b|timbre|net a payer|recapitulatif|report)/;
const BANNER_RE = /bordereau des prix|detail estimatif|^lot\s*:|preambule|engineering|^construction d|^bureautique/;
const COMPONENT_RE = /^(fourniture|pose|main d['’ ]?(oe|œ)uvre|m\.?o\.?|transport|fourniture et pose|f\s*&\s*p)\s*:?$/;
const LABEL_RE = /^\s*(?:\(?(?:[a-z]|[ivx]{1,4}|\d{1,2})\s*(?:\)|°\)?)|[-–•*])\s*\S/i;
const CHAPTER_KW_RE = /^(chapitre|partie|titre|section|lot)\s+([A-Za-z0-9.]+)\s*[:\-–.)]*\s*(.*)$/i;
const NOTE_RE = /^(n\.?\s*b\.?\s*:|nota\b|remarque)/i;

const isCode = (s: string) => ROMAN_RE.test(s) || /^[A-Z]$/.test(s) || ITEM_CODE_RE.test(s) || INT_RE.test(s);

interface Art { num: string; parts: string[]; label: string; emitted: number; unit: string; compUnit: string; comp: boolean; zone: string; pend: { qty: number; unit: string } | null }

/** Bordereau des prix : détecte N° / Désignation / Unité / Quantité, chapitres, articles, variantes a) b) c), lignes « Fourniture / Pose ». */
export function parseBordereau(rows: Row[]): ParsedChapitre[] {
  // ---- 1. En-têtes (il peut y en avoir un par page : on les suit tous) ----
  let first = -1; let map: ColMap | null = null;
  for (let r = 0; r < rows.length; r++) { const m = detectHeader(rows[r]); if (m) { first = r; map = m; break; } }
  let start = first + 1;
  if (!map) {
    map = inferMap(rows);
    if (!map) throw new Error("En-têtes introuvables (Désignation, Quantité requis)");
    start = 0;
  }

  const body = rows.slice(start);
  // Entiers « 1 », « 2 » = chapitres seulement si des articles « 1.x » existent
  const numOf = (v: unknown) => { const t = clean(v); return /^\d+,\d+$/.test(t) ? t.replace(",", ".") : t; };   // « 3,1 » → « 3.1 »
  const nums = new Set(body.map((r) => (map!.num != null ? numOf(r[map!.num]) : "")).filter(Boolean));
  const hasChildren = (n: string) => [...nums].some((x) => x.startsWith(n + "."));

  // Le bordereau déclare-t-il de vrais « CHAPITRE n : … » (souvent dans la colonne N°) ?
  const hasTop = body.some((r) => (map!.num != null && TOP_CHAPTER_RE.test(numOf(r[map!.num]))) || TOP_CHAPTER_RE.test(clean(r[map!.des])));

  const chapitres: ParsedChapitre[] = [];
  let chap: ParsedChapitre | null = null;
  let art: Art | null = null;
  let zone = "";
  let prevUnit = "";
  let intro = "";        // texte descriptif d'un chapitre numéroté (« 2 VOLETS… » + description) repris devant ses variantes (2.1, 2.2…)
  let chapInt = false;   // le chapitre courant est un chapitre « entier » (1, 2, 3…) : un entier sans sous-articles = chapitre frère

  const ensureChap = () => { if (!chap) { chap = { code: "1", titre: "Général", lignes: [] }; chapitres.push(chap); } return chap; };
  const join = (a: string[]) => a.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const stripCode = (t: string, num: string) => (num && t.startsWith(num) && (t.length === num.length || /^[\s.\-–:)]/.test(t[num.length])) ? t.slice(num.length).replace(/^[\s.\-–:)]+/, "") : t);

  function emit(a: Art | null, text: string, unit: string, qty: number) {
    const base = a ? join(a.parts) : "";
    const label = a ? join([a.label, text]) : text;
    const designation = [intro, base, label].filter(Boolean).join(" — ").replace(/\s+/g, " ").trim();
    if (!designation) return;
    const u = unit || a?.unit || a?.compUnit || prevUnit || "";
    if (u) prevUnit = u;
    if (a) { a.emitted++; a.label = ""; a.pend = null; if (unit) a.unit = unit; }
    ensureChap().lignes.push({ numero: a?.num ?? "", designation, quantite: qty, unite: u, zone: a?.zone ?? zone });
  }

  /** Clôture l'article courant. Un article sans quantité mais avec lignes « Fourniture/Pose » ou une unité = ligne à quantité 0 (à compléter). */
  function flush() {
    const a = art; art = null;
    if (!a) return;
    // lignes « Fourniture / Pose » chiffrées sans ligne de total (« L'unité », « L'ensemble »…) : on garde leur quantité
    if (a.emitted === 0 && a.pend) emit(a, "", a.pend.unit || a.unit || a.compUnit, a.pend.qty);
    else if (a.emitted === 0 && (a.comp || a.unit) && a.parts.length) emit(a, "", a.unit, 0);
  }

  for (const row of body) {
    // en-tête répété (saut de page) → on remappe et on continue
    const h = detectHeader(row);
    if (h) { map = h; continue; }

    const num = map.num != null ? numOf(row[map.num]) : "";
    const desRaw = clean(row[map.des]);
    let unite = map.unite != null ? clean(row[map.unite]) : "";
    // PM (dans la colonne Quantité ou Unité) → ligne importée à quantité 0, à repérer dans « Remplir »
    const pm = isPM(row[map.qte]) || (map.unite != null && isPM(row[map.unite]));
    if (pm && isPM(unite)) unite = "";
    const qte = pm ? 0 : toNum(row[map.qte]);
    const des = stripLeaders(desRaw);
    const lower = norm(desRaw);

    if (RECAP_RE.test(lower) || RECAP_RE.test(norm(num))) break;   // « RECAPITULATION GENERALE » : plus aucun article après
    if (!num && !desRaw && qte == null) continue;
    // sous-total de fin de partie (« RESEAUX AERAULIQUES ………… » en majuscules + points) : ni ligne ni sous-titre
    const noDots = desRaw.replace(/[.…_·]{3,}/g, "").trim();
    if (qte == null && !num && noDots && noDots !== desRaw.trim() && noDots === noDots.toUpperCase() && /[A-Z]{3}/.test(noDots)) continue;
    // vrai chapitre « CHAPITRE n : titre »
    const top = hasTop && qte == null ? (num.match(TOP_CHAPTER_RE) ?? desRaw.match(TOP_CHAPTER_RE)) : null;
    if (top) {
      flush();
      chap = { code: top[1], titre: top[2].replace(/\s+/g, " ").trim(), lignes: [] }; chapitres.push(chap); zone = ""; prevUnit = "";
      continue;
    }
    if (pm && !num && !desRaw) continue;
    if (TOTAL_RE.test(lower) && qte == null) continue;      // ne ferme PAS l'article : un S/TOTAL tombe souvent au milieu d'un article (saut de page)
    if (BANNER_RE.test(lower) && qte == null && !num) continue;
    if (num && !isCode(num) && qte == null) continue;       // bannières de page (« CONSTRUCTION D'UNE… », « RECAPITULATIF »…)
    if (num && TOTAL_RE.test(norm(num))) continue;

    // ---- 2. Chapitre ----
    const kw = !num ? desRaw.match(CHAPTER_KW_RE) : null;
    const isRomanOrLetter = !!num && qte == null && !unite && (ROMAN_RE.test(num) || /^[A-Z]$/.test(num));
    const isIntChapter = !!num && qte == null && !unite && INT_RE.test(num) && hasChildren(num);
    // Bordereau à « CHAPITRE n » : I / 1 / 2 / III « 1 - EQUIPEMENTS »… = sous-parties (zone), pas des chapitres.
    // Un « A » / « 2 » suivi d'un texte libre (« Pose et raccordement : ») reste un article numéroté.
    const secLike = !!num && qte == null && !unite && (ROMAN_RE.test(num) || /^[A-Z]$/.test(num) || INT_RE.test(num));
    if (hasTop && secLike && (new RegExp("^" + esc(num) + "\\s*(?:[-–):]|\\.(?!\\d))\\s*\\S").test(desRaw) || /^chapitre\b/i.test(desRaw))) {
      flush();
      zone = stripCode(desRaw, num).replace(/^chapitre\s+\S+\s*[:\-–.)]*\s*/i, "").trim();
      continue;
    }
    if ((!hasTop && (isRomanOrLetter || isIntChapter)) || (kw && qte == null)) {
      flush();
      const code = num || kw![2].toUpperCase();
      const titre = (num ? stripCode(desRaw, num) : kw![3]).replace(/\s+/g, " ").trim();
      chap = { code, titre, lignes: [] }; chapitres.push(chap); zone = ""; prevUnit = "";
      // chapitre « 2 » + titre sur la 1re ligne et description des travaux sur les suivantes
      const lines = String(row[map.des] ?? "").split(/\r?\n/).map(clean).filter(Boolean);
      intro = ""; chapInt = isIntChapter;
      if (isIntChapter && lines.length > 1) { chap.titre = stripCode(lines[0], num); intro = clean(lines.join(" ")); }
      continue;
    }

    // ---- 3. Nouvel article (code 1.1, 1.4.1, A.2…) ----
    if (num && isCode(num)) {
      if (!hasTop && chapInt && INT_RE.test(num) && !hasChildren(num)) {
        // « 4 », « 5 »… sans sous-articles, entre deux chapitres numériques : article autonome = son propre chapitre
        flush(); intro = "";
        const t = stripCode(des, num);
        chap = { code: num, titre: t.length > 100 ? t.slice(0, 97).trimEnd() + "…" : t, lignes: [] }; chapitres.push(chap); zone = ""; prevUnit = "";
      }
      const prev = art;
      // « 1.2 VENTILATION ATEX » puis « A ventilateur… » : la variante A hérite du titre de 1.2 (et garde son n°)
      const letter = /^[A-Z]$/.test(num) && !!prev && !/^[A-Z]$/.test(prev.num);
      const nested = !!prev && prev.emitted === 0 && !prev.unit && !prev.comp && (num.startsWith(prev.num + ".") || letter);
      const inherited = nested ? prev!.parts : [];
      if (!nested) flush(); else art = null;
      const title = stripCode(des, num);
      art = { num: nested && letter ? prev!.num : num, parts: [...inherited, ...(title ? [title] : [])], label: "", emitted: 0, unit: "", compUnit: "", comp: false, zone, pend: null };
      if (qte != null) emit(art, "", unite, qte);
      else if (unite && !COMPONENT_RE.test(lower)) art.unit = unite;
      continue;
    }

    // ---- 4. Lignes sans numéro ----
    if (!desRaw && qte == null) continue;

    // « Fourniture » / « Pose » : composantes de prix de l'article, pas des lignes
    if (COMPONENT_RE.test(lower)) {
      if (art) { art.comp = true; if (unite) art.compUnit = unite; }
      // « Fourniture : U 1 », « Pose : U 1 » portent la même quantité que la ligne de total qui suit (« L'unité : U 1 ») :
      // on la met de côté, et on ne l'émet que si aucune ligne de total ne vient (évite les doublons)
      if (qte != null && art && art.emitted === 0 && !art.pend) art.pend = { qty: qte, unit: unite };
      continue;
    }

    if (qte != null) {
      // Ligne de quantité : désignation = description de l'article + variante (a/b/c) + texte éventuel de la ligne
      if (!art) { if (des) emit(null, des, unite, qte); else if (zone) emit(null, zone, unite, qte); continue; }
      emit(art, des, unite, qte);
      continue;
    }

    // Texte sans quantité
    if (!des) continue;                                      // simple ligne de points / « L'Unité……… »
    if (unite && art && !COMPONENT_RE.test(lower)) art.unit = unite;   // ligne de description portant l'unité
    if (!art) {
      // hors article : sous-titre de zone (« Split-système mural »), sinon texte de préambule ignoré
      if (des.length <= 80 && !NOTE_RE.test(des)) zone = des;
      continue;
    }
    if (LABEL_RE.test(des)) { art.label = des; continue; }   // variante « a) … »
    if (art.emitted > 0) {
      const upper = des === des.toUpperCase() && /[A-Z]{3}/.test(des) && des.length <= 60;
      if (upper) {
        // intitulé de bloc répété dans le même article (« CARACTERISTIQUES TECHNIQUES CTA 6 » après « … CTA 5 ») = nouvelle variante
        const key = norm(des).split(" ").slice(0, 2).join(" ");
        const at = art.parts.findIndex((p) => norm(p).startsWith(key));
        if (at > 0) { art.parts = [...art.parts.slice(0, at), des]; continue; }
        flush(); zone = des; continue;                       // nouveau sous-titre en MAJUSCULES
      }
      art.label = join([art.label, des]);                    // précision de variante sans « a) » (ex. « 250 x 250 »)
    } else art.parts.push(des);
  }
  flush();

  return chapitres.filter((c) => c.lignes.length);
}

export interface ParsedOffre { reference: string; designation: string; unite: string; prix: number; delai: number | null; pose: number | null }
export function parseCatalogue(rows: Row[]): ParsedOffre[] {
  const h = findHeader(rows, {
    ref: /^(ref|reference|code|sku|article)/, des: /designation|libelle|description|produit/,
    unite: /^(u|unite|unit)/, pose: POSE_RE, prix: /^(?!.*(pose|main d|install)).*(prix|pu|tarif|price|fourniture)/, delai: /delai|lead/,
  }, ["des", "prix"]);
  if (!h) throw new Error("En-têtes introuvables (Désignation, Prix requis)");
  const { map } = h;
  return rows.slice(h.row + 1).map((r) => ({
    reference: map.ref != null ? String(r[map.ref] ?? "").trim() : "",
    designation: String(r[map.des] ?? "").trim(),
    unite: map.unite != null ? String(r[map.unite] ?? "").trim() : "",
    prix: toNum(r[map.prix]) ?? NaN,
    delai: map.delai != null ? toNum(r[map.delai]) : null,
    pose: map.pose != null ? (toNum(r[map.pose]) ?? 0) : null,
  })).filter((o) => o.designation && Number.isFinite(o.prix));
}

export interface ParsedPose { designation: string; pose: number }
/** Grille de pose : Catégorie ou Désignation + Prix de pose. */
export function parseGrillePose(rows: Row[]): ParsedPose[] {
  const h = findHeader(rows, { des: /designation|libelle|categorie|article|produit/, pose: /pose|main d.?(oe|œ)uvre|^m\.?o\.?$|installation|prix/ }, ["des", "pose"]);
  if (!h) throw new Error("En-têtes introuvables (Désignation ou Catégorie, Pose requis)");
  return rows.slice(h.row + 1).map((r) => ({ designation: String(r[h.map.des] ?? "").trim(), pose: toNum(r[h.map.pose]) ?? NaN }))
    .filter((p) => p.designation && Number.isFinite(p.pose));
}