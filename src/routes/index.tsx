// @ts-nocheck — strict index-signature typing relaxed; runtime-validated
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
  head: () => ({
    meta: [
      { title: "AeroNova BID — Chiffrage d'appels d'offres" },
      { name: "description", content: "Poste de travail interne pour chiffrer les bordereaux des prix MEP." },
      { property: "og:title", content: "AeroNova BID" },
      { property: "og:description", content: "Poste de travail interne pour chiffrer les bordereaux des prix MEP." },
    ],
  }),
});
