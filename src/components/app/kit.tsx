import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="flex min-h-14 items-center gap-3 px-5 py-2">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

export const STATUT_LIGNE = {
  non_rempli: { label: "Non rempli", dot: "bg-idle", text: "text-muted-foreground" },
  suggestion_ia: { label: "Suggestion IA", dot: "bg-attention", text: "text-attention-foreground" },
  verifie: { label: "Vérifié", dot: "bg-ok", text: "text-ok" },
} as const;

export function Dot({ className }: { className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} />;
}

export function ConfBadge({ c }: { c?: string | null }) {
  const m: Record<string, string> = {
    high: "bg-ok-soft text-ok border-ok/30",
    medium: "bg-attention-soft text-attention-foreground border-attention/40",
    low: "bg-destructive/10 text-destructive border-destructive/30",
    none: "bg-muted text-muted-foreground border-border",
  };
  const lbl: Record<string, string> = { high: "HAUTE", medium: "MOY.", low: "FAIBLE", none: "AUCUNE" };
  if (!c) return null;
  return <span className={cn("num inline-flex items-center rounded-sm border px-1.5 py-px text-[11px] font-semibold tracking-wider", m[c])}>{lbl[c]}</span>;
}

export function Stat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: "attention" | "ok" | "bad"; hint?: ReactNode }) {
  return (
    <div className="rounded border bg-card px-3 py-2.5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("num mt-0.5 text-xl font-medium", tone === "attention" && "text-attention", tone === "ok" && "text-ok", tone === "bad" && "text-destructive")}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export const CHANTIER_STATUT: Record<string, string> = { brouillon: "Brouillon", en_cours: "En cours", soumis: "Soumis", gagne: "Gagné", perdu: "Perdu" };

export function daysAgo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function logActivity(sb: any, userId: string, action: string, entity?: string, entity_id?: string, details?: unknown) {
  return sb.from("activity_log").insert({ user_id: userId, action, entity, entity_id, details });
}
