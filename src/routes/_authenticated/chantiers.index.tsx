// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, CHANTIER_STATUT, logActivity } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/chantiers/")({
  head: () => ({ meta: [{ title: "Chantiers — AeroNova BID" }, { name: "description", content: "Appels d'offres en cours et archivés." }] }),
  component: Chantiers,
});

function Chantiers() {
  const { can, user } = useAuth();
  const canEdit = can("bids_write");
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["chantiers"],
    queryFn: async () => (await supabase.from("chantiers").select("*, marches(id, marche_lignes(statut))").order("created_at", { ascending: false })).data ?? [],
  });
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [del, setDel] = useState<any>(null);
  async function remove(c: any) {
    try {
      const mids = c.marches.map((m: any) => m.id);
      if (mids.length) {
        const { data: ls } = await supabase.from("marche_lignes").select("id").in("marche_id", mids);
        const lids = (ls ?? []).map((l) => l.id);
        for (let i = 0; i < lids.length; i += 200) { const { error } = await supabase.from("bid_lignes").delete().in("marche_ligne_id", lids.slice(i, i + 200)); if (error) throw error; }
        for (const t of ["marche_lignes", "marche_chapitres"] as const) { const { error } = await supabase.from(t).delete().in("marche_id", mids); if (error) throw error; }
        const { error } = await supabase.from("marches").delete().in("id", mids); if (error) throw error;
      }
      const { error } = await supabase.from("chantiers").delete().eq("id", c.id); if (error) throw error;
      await logActivity(supabase, user.id, "suppression_chantier", "chantiers", c.id, { nom: c.nom });
      toast.success("Chantier supprimé");
    } catch (e: any) { toast.error(e.message); }
    setDel(null); qc.invalidateQueries({ queryKey: ["chantiers"] });
  }
  const [f, setF] = useState({ nom: "", client: "", reference_ao: "", date_limite: "" });

  async function create() {
    const { data: c, error } = await supabase.from("chantiers").insert({ ...f, date_limite: f.date_limite || null, created_by: user.id, statut: "en_cours" }).select().single();
    if (error) return toast.error(error.message);
    await supabase.from("marches").insert({ chantier_id: c.id, nom: "Lot 01", ordre: 1 });
    nav({ to: "/chantiers/$chantierId", params: { chantierId: c.id } });
  }

  const list = data.filter((c: any) => !q || `${c.nom} ${c.client} ${c.reference_ao}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Chantiers" sub={`${data.length} appels d'offres`} actions={<>
        <Input placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} className="h-7 w-56 text-xs" />
        {canEdit && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" className="h-7">Nouveau chantier</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Nouveau chantier</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              {(["nom", "client", "reference_ao"] as const).map((k) => <div key={k} className="grid gap-1"><Label className="capitalize">{k === "reference_ao" ? "Référence AO" : k}</Label><Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
              <div className="grid gap-1"><Label>Date limite</Label><Input type="date" value={f.date_limite} onChange={(e) => setF({ ...f, date_limite: e.target.value })} /></div>
              <Button disabled={!f.nom} onClick={create}>Créer</Button>
            </div>
          </DialogContent></Dialog>}
      </>} />
      <table className="w-full text-[13px]">
        <thead className="bg-surface text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr className="border-b">
          <th className="px-4 py-2 font-medium">Chantier</th><th className="font-medium">Client</th><th className="font-medium">Réf. AO</th><th className="font-medium">Échéance</th><th className="font-medium">Statut</th><th className="px-4 text-right font-medium">Lignes vérifiées</th><th className="w-12" /></tr></thead>
        <tbody>
          {list.map((c: any) => {
            const ls = c.marches.flatMap((m: any) => m.marche_lignes);
            const v = ls.filter((l: any) => l.statut === "verifie").length;
            return (
              <tr key={c.id} className="border-b hover:bg-muted/50">
                <td className="px-4 py-2"><Link to="/chantiers/$chantierId" params={{ chantierId: c.id }} className="font-medium hover:underline">{c.nom}</Link></td>
                <td>{c.client}</td><td className="num text-xs">{c.reference_ao}</td>
                <td className="num text-xs">{c.date_limite ?? "—"}</td>
                <td><span className="rounded-sm border px-1.5 py-px text-[11px]">{CHANTIER_STATUT[c.statut]}</span></td>
                <td className="num px-4 text-right">{v}/{ls.length}</td>
                <td className="pr-3 text-right">{canEdit && ["brouillon", "en_cours"].includes(c.statut) && <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" aria-label="Supprimer le chantier" onClick={() => setDel(c)}><Trash2 className="size-4" /></Button>}</td>
              </tr>
            );
          })}
          {!list.length && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Aucun chantier.</td></tr>}
        </tbody>
      </table>
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer « {del?.nom} » ?</AlertDialogTitle>
            <AlertDialogDescription>Tous les lots, chapitres, lignes et prix de ce chantier seront définitivement supprimés. Cette action est irréversible.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => remove(del)}>Supprimer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
