import { createFileRoute, Outlet } from "@tanstack/react-router";

// Pure layout route: renders whichever child matches (/fournisseurs/ → list, /fournisseurs/$fournisseurId → detail).
export const Route = createFileRoute("/_authenticated/fournisseurs")({
  component: () => <Outlet />,
});