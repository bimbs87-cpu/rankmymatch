import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/groups/$groupId/seasons")({
  component: SeasonsLayout,
});

function SeasonsLayout() {
  return <Outlet />;
}