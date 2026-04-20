import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Legacy round detail route.
 *
 * The dedicated round page was removed in favor of an inline expansion inside
 * the group's "Agenda e resultados" view (so users keep the group context and
 * can confirm presence without leaving the page).
 *
 * This route now just redirects to the group page with deep-link search params
 * that auto-expand the matching season and round.
 */
export const Route = createFileRoute(
  "/groups/$groupId/seasons/$seasonId/rounds/$roundId"
)({
  component: RoundRedirect,
});

function RoundRedirect() {
  const { groupId, seasonId, roundId } = Route.useParams();
  return (
    <Navigate
      to="/groups/$groupId"
      params={{ groupId }}
      search={{ view: "seasons", season: seasonId, round: roundId }}
      replace
    />
  );
}
