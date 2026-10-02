// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { describe, expect, it } from "vitest";
import { computeBid, computeRemise, prixVente, type BidInput } from "./bid-math";

const base = (over: Partial<BidInput> = {}): BidInput => ({
  chapitres: [
    { id: "A", code: "A", remise: { type: "pct", valeur: 0 }, lignes: [
      { id: "a1", quantite: 10, prixUnitaire: 100, prixAchat: 80 },
      { id: "a2", quantite: 2, prixUnitaire: 50, prixAchat: 40 },
    ] },
    { id: "B", code: "B", remise: { type: "pct", valeur: 0 }, lignes: [
      { id: "b1", quantite: 1, prixUnitaire: 900, prixAchat: 700 },
    ] },
  ],
  remiseGlobale: { type: "pct", valeur: 0 },
  tvaTaux: 19,
  timbreFiscal: 1,
  ...over,
});

describe("computeRemise", () => {
  it("caps percent discounts above 100%", () => expect(computeRemise(500, { type: "pct", valeur: 150 })).toBe(500));
  it("caps fixed discounts larger than the subtotal", () => expect(computeRemise(200, { type: "montant", valeur: 999 })).toBe(200));
  it("ignores negative discounts", () => expect(computeRemise(200, { type: "pct", valeur: -10 })).toBe(0));
  it("returns 0 on non-positive base", () => expect(computeRemise(-50, { type: "montant", valeur: 10 })).toBe(0));
});

describe("computeBid", () => {
  it("computes the straight path", () => {
    const r = computeBid(base());
    expect(r.totalChapitres).toBe(2000);
    expect(r.totalHT).toBe(2000);
    expect(r.tva).toBe(380);
    expect(r.netAPayer).toBe(2381);
    expect(r.coutTotal).toBe(1580);
    expect(r.marge).toBe(420);
  });

  it("applies chapter discount before global discount", () => {
    const b = base({ remiseGlobale: { type: "pct", valeur: 10 } });
    b.chapitres[0].remise = { type: "pct", valeur: 10 }; // A: 1100 → 990
    const r = computeBid(b);
    expect(r.chapitres[0].net).toBe(990);
    expect(r.totalChapitres).toBe(1890);
    expect(r.remiseGlobale).toBe(189);
    expect(r.totalHT).toBe(1701);
  });

  it("never discounts or taxes the timbre fiscal", () => {
    const r = computeBid(base({ remiseGlobale: { type: "pct", valeur: 100 } }));
    expect(r.totalHT).toBe(0);
    expect(r.tva).toBe(0);
    expect(r.netAPayer).toBe(1);
  });

  it("does not produce negative totals from oversized fixed discounts", () => {
    const b = base({ remiseGlobale: { type: "montant", valeur: 1e9 } });
    b.chapitres[1].remise = { type: "montant", valeur: 5000 };
    const r = computeBid(b);
    expect(r.chapitres[1].net).toBe(0);
    expect(r.totalHT).toBe(0);
    expect(r.netAPayer).toBe(1);
  });

  it("clamps negative line inputs at chapter level", () => {
    const b = base();
    b.chapitres[1].lignes = [{ id: "neg", quantite: -3, prixUnitaire: 100 }];
    expect(computeBid(b).chapitres[1].sousTotal).toBe(0);
  });

  it("supports 7% TVA and rounds to millimes", () => {
    const b = base({ tvaTaux: 7 });
    b.chapitres = [{ id: "X", code: "X", remise: { type: "pct", valeur: 0 }, lignes: [{ id: "x", quantite: 3, prixUnitaire: 0.3333 }] }];
    const r = computeBid(b);
    expect(r.totalHT).toBe(1);
    expect(r.tva).toBe(0.07);
    expect(r.netAPayer).toBe(2.07);
  });

  it("treats unpriced lines as zero", () => {
    const b = base();
    b.chapitres[0].lignes.push({ id: "np", quantite: 50, prixUnitaire: null });
    expect(computeBid(b).lignesTotal.np).toBe(0);
  });
});

describe("prixVente", () => {
  it("applies margin", () => expect(prixVente(10, 25)).toBe(12.5));
});
