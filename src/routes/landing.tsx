import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingPage } from "@/components/LandingPage";
import { trackEvent } from "@/lib/analytics";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "RankMyMatch — Ranking de Padel para seu grupo" },
      {
        name: "description",
        content:
          "Crie seu grupo de padel, registre partidas e acompanhe o ranking Elo de cada jogador. Grátis para começar.",
      },
      { property: "og:title", content: "RankMyMatch — Ranking de Padel para seu grupo" },
      {
        property: "og:description",
        content:
          "Crie seu grupo de padel, registre partidas e acompanhe o ranking Elo de cada jogador.",
      },
    ],
  }),
  component: LandingRoute,
});

function LandingRoute() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    trackEvent("landing_view", {
      utm_source: params.get("utm_source") ?? "(none)",
      utm_medium: params.get("utm_medium") ?? "(none)",
      utm_campaign: params.get("utm_campaign") ?? "(none)",
      utm_content: params.get("utm_content") ?? "(none)",
      utm_term: params.get("utm_term") ?? "(none)",
      referrer: document.referrer || "(direct)",
      landing_path: window.location.pathname,
    });
  }, []);

  return <LandingPage />;
}
