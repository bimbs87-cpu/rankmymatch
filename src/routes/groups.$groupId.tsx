import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/groups/$groupId")({
  component: GroupLayout,
});

function GroupLayout() {
  return <Outlet />;
}