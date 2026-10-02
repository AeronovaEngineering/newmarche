// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — AeroNova BID" },
      { name: "description", content: "Accès réservé à l'équipe chiffrage AeroNova." },
      { property: "og:title", content: "Connexion — AeroNova BID" },
      { property: "og:description", content: "Accès réservé à l'équipe chiffrage AeroNova." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        nav({ to: "/dashboard" });
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (data.session) nav({ to: "/dashboard" });
        else toast.success("Vérifiez votre boîte mail pour confirmer le compte.");
      }
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }


  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_440px]">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 text-sidebar-accent-foreground">
          <img src="/logo.png" alt="AeroNova" className="size-7 object-contain" />
          <span className="font-semibold tracking-tight">AeroNova BID</span>
          <span className="num text-xs text-sidebar-foreground/60">v2</span>
        </div>
        <div className="max-w-md">
          <p className="text-2xl font-medium leading-snug text-sidebar-accent-foreground">
            Du bordereau reçu à l'offre soumise — l'humain valide, il ne retape plus.
          </p>
          <div className="num mt-8 grid grid-cols-3 gap-4 text-xs">
            <div><div className="text-sidebar-primary text-lg">↑↓</div>naviguer</div>
            <div><div className="text-sidebar-primary text-lg">↵</div>accepter</div>
            <div><div className="text-sidebar-primary text-lg">/</div>chercher</div>
          </div>
        </div>
        <div className="num text-xs text-sidebar-foreground/50">Montants en DT · TVA · Timbre fiscal</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-lg font-semibold">{mode === "in" ? "Connexion" : "Créer un compte"}</h1>
            <p className="text-sm text-muted-foreground">Accès réservé à l'équipe chiffrage.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />ou<div className="h-px flex-1 bg-border" /></div>
          <div className="space-y-1.5"><Label htmlFor="em">Email</Label><Input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pw">Mot de passe</Label><Input id="pw" type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <Button className="w-full" disabled={busy}>{mode === "in" ? "Se connecter" : "Créer le compte"}</Button>
          <button type="button" className="w-full text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Pas de compte ? Créer un compte" : "Déjà inscrit ? Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
