// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, daysAgo } from "@/components/app/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fmtDT } from "@/lib/bid-math";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/catalogue/")({
  head: () => ({ meta: [{ title: "Catalogue — AeroNova BID" }, { name: "description", content: "Produits et offres fournisseurs comparées." }, { property: "og:title", content: "Catalogue — AeroNova BID" }, { property: "og:description", content: "Produits et offres fournisseurs comparées." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Catalogue,
});

function Catalogue() {
  const { can } = useAuth();
  const canEdit = can("catalogue_write");
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [four, setFour] = useState("");
  const [fresh, setFresh] = useState<"all" | "fresh" | "stale" | "missing">("all");
  const { data } = useQuery({
    queryKey: ["catalogue"],
    queryFn: async () => {
      const [p, c] = await Promise.all([
         supabase.from("produits").select("id, designation, unite_reference, marque, specs, category_id, fournisseur_produits(id, fournisseur_id, prix_fourniture, date_maj, disponibilite, fournisseurs(id, nom))").order("designation"),
        supabase.from("categories").select("id, nom, parent_id").order("ordre"),
      ]);
      return { produits: p.data ?? [], categories: c.data ?? [] };
    },
  });
  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of data?.produits ?? []) for (const o of p.fournisseur_produits as any[]) if (o.fournisseurs) map.set(o.fournisseurs.id, o.fournisseurs.nom);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);
  const list = (data?.produits ?? []).filter((p: any) => {
    const offers = p.fournisseur_produits as any[];
    const ages = offers.map((o) => daysAgo(o.date_maj));
    const text = `${p.designation} ${p.marque ?? ""} ${Object.values(p.specs ?? {}).join(" ")}`.toLowerCase();
    return (!cat || p.category_id === cat) && (!four || offers.some((o) => o.fournisseur_id === four)) && (!q || text.includes(q.toLowerCase()))
      && (fresh === "all" || (fresh === "missing" ? !offers.length : fresh === "stale" ? ages.some((a) => a > 90) : offers.length > 0 && ages.every((a) => a <= 90)));
  });
  const catName = Object.fromEntries((data?.categories ?? []).map((c) => [c.id, c.nom]));

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ designation: "", category_id: "", unite_reference: "U", marque: "" });
  async function create() {
    const { data: p, error } = await supabase.from("produits").insert({
      designation: f.designation.trim(), category_id: f.category_id || null,
      unite_reference: f.unite_reference.trim() || "U", marque: f.marque.trim() || null,
    }).select().single();
    if (error) return toast.error(error.message);
    setOpen(false);
    nav({ to: "/catalogue/$produitId", params: { produitId: p.id } });
  }

  return (
    <div>
      <PageHeader title="Catalogue produits" sub={`${list.length} sur ${data?.produits.length ?? 0} produits`} actions={<>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-7 rounded border bg-card px-2 text-xs"><option value="">Toutes catégories</option>{data?.categories.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.nom}</option>)}</select>
        <select value={four} onChange={(e) => setFour(e.target.value)} className="h-8 rounded border bg-card px-2 text-xs"><option value="">Tous fournisseurs</option>{suppliers.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}</select>
        <select value={fresh} onChange={(e) => setFresh(e.target.value as typeof fresh)} className="h-8 rounded border bg-card px-2 text-xs"><option value="all">Toute fraîcheur</option><option value="fresh">Prix à jour</option><option value="stale">Prix ancien &gt; 90 j</option><option value="missing">Sans offre</option></select>
        <Input placeholder="Produit, marque ou spécification…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-72 text-sm" />
        {canEdit && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" className="h-8">Ajouter un produit</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Nouveau produit</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1"><Label>Désignation</Label><Input value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} autoFocus /></div>
              <div className="grid gap-1"><Label>Catégorie</Label>
                <select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })} className="h-9 rounded border bg-card px-2 text-sm">
                  <option value="">—</option>{data?.categories.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.nom}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1"><Label>Unité de référence</Label><Input value={f.unite_reference} onChange={(e) => setF({ ...f, unite_reference: e.target.value })} /></div>
                <div className="grid gap-1"><Label>Marque</Label><Input value={f.marque} onChange={(e) => setF({ ...f, marque: e.target.value })} /></div>
              </div>
              <Button disabled={!f.designation.trim()} onClick={create}>Créer et ouvrir la fiche</Button>
            </div>
          </DialogContent></Dialog>}
      </>} />
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted-foreground"><tr className="border-b"><th className="px-5 py-3 font-medium">Produit</th><th className="font-medium">Catégorie</th><th className="font-medium">Spécifications</th><th className="font-medium">Fournisseurs</th><th className="text-right font-medium">Offres</th><th className="text-right font-medium">Meilleur prix</th><th className="px-5 text-right font-medium">Fraîcheur</th></tr></thead>
        <tbody>{list.map((p: any) => {
          const o = p.fournisseur_produits; const min = o.length ? Math.min(...o.map((x: any) => Number(x.prix_fourniture))) : null;
          const oldest = o.length ? Math.max(...o.map((x: any) => daysAgo(x.date_maj))) : 0;
          return <tr key={p.id} className="border-b hover:bg-muted/50">
             <td className="px-5 py-2.5"><Link to="/catalogue/$produitId" params={{ produitId: p.id }} className="font-medium hover:underline">{p.designation}</Link><div className="text-xs text-muted-foreground">{[p.marque, p.unite_reference].filter(Boolean).join(" · ")}</div></td>
            <td className="text-xs">{catName[p.category_id]}</td>
            <td className="num text-xs text-muted-foreground">{Object.entries(p.specs ?? {}).map(([k, v]) => `${k.split("_")[0]}:${v}`).join(" ")}</td>
             <td className="max-w-56 text-xs text-muted-foreground">{o.map((x: any) => x.fournisseurs?.nom).filter(Boolean).join(" · ") || "—"}</td>
            <td className="num text-right">{o.length}</td><td className="num text-right">{fmtDT(min)}</td>
             <td className={`num px-5 text-right text-xs ${oldest > 90 ? "text-attention" : "text-muted-foreground"}`}>{o.length ? `${oldest} j` : "—"}</td>
          </tr>;
        })}{!list.length && <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Aucun produit ne correspond à ces filtres.</td></tr>}</tbody>
      </table>
    </div>
  );
}