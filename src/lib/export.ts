import { computeBid, fmtDT, type BidResult } from "./bid-math";

export interface ExportLigne { id: string; numero: string | null; designation: string; unite: string | null; quantite: number; prix_unitaire: number | null; prix_achat: number | null; prix_pose: number | null }
export interface ExportChapitre { id: string; code: string; titre: string | null; remise_type: "pct" | "montant"; remise_valeur: number; lignes: ExportLigne[] }
export interface ExportData {
  chantier: { nom: string; client: string | null; reference_ao: string | null; tva_taux: number; timbre_fiscal: number; remise_globale_type: "pct" | "montant"; remise_globale_valeur: number };
  marche: { nom: string };
  chapitres: ExportChapitre[];
}

/**
 * Builds ExportData from a chantier row with its nested marches → marche_chapitres →
 * marche_lignes(bid_lignes) fetched the way chantiers.$chantierId.tsx and
 * validation.$chantierId.tsx both query it. Kept in one place so the two pages
 * (and export) never compute totals from two slightly different shapes.
 * bid_lignes.prix_unitaire is always the combined sell price (fourniture + pose) —
 * prix_pose is broken out here purely for display/export, never added twice.
 */
export function buildExportData(chantier: any, marches: any[]): ExportData {
  const sorted = [...marches].sort((a, b) => a.ordre - b.ordre);
  return {
    chantier,
    marche: { nom: sorted.map((m) => m.nom).join(" + ") },
    chapitres: sorted.flatMap((m) => [...m.marche_chapitres].sort((a: any, b: any) => a.ordre - b.ordre).map((ch: any) => ({
      id: ch.id, code: sorted.length > 1 ? `${m.ordre}.${ch.code}` : ch.code, titre: ch.titre, remise_type: ch.remise_type, remise_valeur: Number(ch.remise_valeur),
      lignes: m.marche_lignes.filter((l: any) => l.chapitre_id === ch.id).sort((a: any, b: any) => a.ordre - b.ordre).map((l: any) => ({
        id: l.id, numero: l.numero, designation: l.designation, unite: l.unite, quantite: Number(l.quantite),
        prix_unitaire: l.bid_lignes?.prix_unitaire != null ? Number(l.bid_lignes.prix_unitaire) : null,
        prix_achat: l.bid_lignes?.prix_achat != null ? Number(l.bid_lignes.prix_achat) : null,
        prix_pose: l.bid_lignes?.prix_pose != null ? Number(l.bid_lignes.prix_pose) : null,
      })),
    }))),
  };
}

export function totalsFor(d: ExportData): BidResult {
  return computeBid({
    chapitres: d.chapitres.map((c) => ({ id: c.id, code: c.code, titre: c.titre, remise: { type: c.remise_type, valeur: Number(c.remise_valeur) },
      lignes: c.lignes.map((l) => ({ id: l.id, quantite: Number(l.quantite), prixUnitaire: l.prix_unitaire, prixAchat: l.prix_achat })) })),
    remiseGlobale: { type: d.chantier.remise_globale_type, valeur: Number(d.chantier.remise_globale_valeur) },
    tvaTaux: Number(d.chantier.tva_taux), timbreFiscal: Number(d.chantier.timbre_fiscal),
  });
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
const fourn = (l: ExportLigne) => (l.prix_unitaire != null ? l.prix_unitaire - (l.prix_pose ?? 0) : null);

export async function exportExcel(d: ExportData) {
  const ExcelJS = (await import("exceljs")).default;
  const t = totalsFor(d);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Bordereau");
  ws.columns = [{ width: 10 }, { width: 58 }, { width: 8 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 18 }];
  const money = "#,##0.000";
  ws.addRow([d.chantier.nom]).font = { bold: true, size: 14 };
  ws.addRow([`${d.marche.nom}${d.chantier.client ? " — " + d.chantier.client : ""}${d.chantier.reference_ao ? " — " + d.chantier.reference_ao : ""}`]);
  ws.addRow([]);
  const head = ws.addRow(["N°", "Désignation", "Unité", "Quantité", "P.U. Fourniture", "P.U. Pose", "P.U. Total HT (DT)", "Montant HT (DT)"]);
  head.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B2F36" } }; c.border = { bottom: { style: "thin" } }; });
  for (const c of d.chapitres) {
    const cr = t.chapitres.find((x) => x.id === c.id)!;
    const r = ws.addRow([c.code, c.titre ?? ""]); r.font = { bold: true }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
    for (const l of c.lignes) {
      const row = ws.addRow([l.numero ?? "", l.designation, l.unite ?? "", Number(l.quantite), fourn(l) ?? 0, l.prix_pose ?? 0, l.prix_unitaire ?? 0, t.lignesTotal[l.id] ?? 0]);
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
      row.getCell(5).numFmt = money; row.getCell(6).numFmt = money; row.getCell(7).numFmt = money; row.getCell(8).numFmt = money;
    }
    const st = ws.addRow(["", `Sous-total ${c.code}`, "", "", "", "", "", cr.sousTotal]); st.font = { bold: true }; st.getCell(8).numFmt = money;
    if (cr.remise) { const rr = ws.addRow(["", `Remise ${c.code}`, "", "", "", "", "", -cr.remise]); rr.getCell(8).numFmt = money; }
  }
  ws.addRow([]);
  const recap: [string, number][] = [["Total chapitres HT", t.totalChapitres]];
  if (t.remiseGlobale) recap.push(["Remise globale", -t.remiseGlobale]);
  recap.push(["Total HT", t.totalHT], [`TVA ${d.chantier.tva_taux}%`, t.tva], ["Total TTC", t.totalTTC], ["Timbre fiscal", t.timbre], ["NET À PAYER (DT)", t.netAPayer]);
  for (const [k, v] of recap) { const r = ws.addRow(["", "", "", "", "", "", k, v]); r.getCell(7).font = { bold: true }; r.getCell(8).numFmt = money; r.getCell(8).font = { bold: true }; }
  ws.views = [{ state: "frozen", ySplit: 4 }];
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Bordereau_${slug(d.chantier.nom)}.xlsx`);
}

export async function exportPdf(d: ExportData) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const t = totalsFor(d);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("BORDEREAU DES PRIX — OFFRE FINANCIÈRE", 14, 18);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  doc.text([d.chantier.nom, d.marche.nom, [d.chantier.client, d.chantier.reference_ao].filter(Boolean).join(" · "), `Édité le ${new Date().toLocaleDateString("fr-TN")}`].filter(Boolean) as string[], 14, 25);
  const body: any[] = [];
  for (const c of d.chapitres) {
    const cr = t.chapitres.find((x) => x.id === c.id)!;
    body.push([{ content: `${c.code}  ${c.titre ?? ""}`, colSpan: 7, styles: { fontStyle: "bold", fillColor: [236, 236, 236] } }]);
    for (const l of c.lignes) body.push([l.numero ?? "", l.designation, l.unite ?? "", fmtDT(Number(l.quantite)), fmtDT(fourn(l) ?? 0), fmtDT(l.prix_pose ?? 0), fmtDT(l.prix_unitaire ?? 0), fmtDT(t.lignesTotal[l.id] ?? 0)]);
    body.push([{ content: `Sous-total ${c.code}`, colSpan: 6, styles: { halign: "right", fontStyle: "bold" } }, { content: fmtDT(cr.sousTotal), styles: { fontStyle: "bold" } }]);
    if (cr.remise) body.push([{ content: `Remise ${c.code}`, colSpan: 6, styles: { halign: "right" } }, `-${fmtDT(cr.remise)}`]);
  }
  autoTable(doc, {
    startY: 32, head: [["N°", "Désignation", "U", "Qté", "P.U. Fourn.", "P.U. Pose", "P.U. Total", "Montant HT"]], body,
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.6, lineColor: [210, 210, 210], lineWidth: 0.1 },
    headStyles: { fillColor: [43, 47, 54], textColor: 255 },
    columnStyles: { 0: { cellWidth: 16 }, 2: { cellWidth: 10, halign: "center" }, 3: { cellWidth: 16, halign: "right" }, 4: { cellWidth: 22, halign: "right" }, 5: { cellWidth: 20, halign: "right" }, 6: { cellWidth: 22, halign: "right" }, 7: { cellWidth: 26, halign: "right" } },
    didDrawPage: () => { doc.setFontSize(7.5); doc.setTextColor(130); doc.text(`Page ${doc.getNumberOfPages()}`, W - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" }); doc.setTextColor(0); },
  });
  const rows: [string, string][] = [["Total chapitres HT", fmtDT(t.totalChapitres)]];
  if (t.remiseGlobale) rows.push(["Remise globale", `-${fmtDT(t.remiseGlobale)}`]);
  rows.push(["Total HT", fmtDT(t.totalHT)], [`TVA ${d.chantier.tva_taux}%`, fmtDT(t.tva)], ["Total TTC", fmtDT(t.totalTTC)], ["Timbre fiscal", fmtDT(t.timbre)], ["NET À PAYER (DT)", fmtDT(t.netAPayer)]);
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6, margin: { left: W - 14 - 90 }, tableWidth: 90, body: rows, theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 }, columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: (h) => { if (h.row.index === rows.length - 1) { h.cell.styles.fillColor = [43, 47, 54]; h.cell.styles.textColor = 255; h.cell.styles.fontStyle = "bold"; } },
  });
  doc.save(`Bordereau_${slug(d.chantier.nom)}.pdf`);
}
