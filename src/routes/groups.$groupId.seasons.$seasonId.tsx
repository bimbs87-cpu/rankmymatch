import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/groups/$groupId/seasons/$seasonId")({
  component: SeasonDetailLayout,
});

function SeasonDetailLayout() {
  return <Outlet />;
}
