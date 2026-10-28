import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingPage } from "@/components/LandingPage";
import { trackEvent } from "@/lib/analytics";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "Raqueteia — Ranking de Padel para seu grupo" },
      {
        name: "description",
        content:
          "Crie seu grupo de padel, registre partidas e acompanhe o ranking Elo de cada jogador. Grátis para começar.",
      },
      { property: "og:title", content: "Raqueteia — Ranking de Padel para seu grupo" },
      {
        property: "og:description",
        content:
          "Crie seu grupo de padel, registre partidas e acompanhe o ranking Elo de cada jogador.",
      },
      { property: "og:url", content: "https://raqueteia.app/landing" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Raqueteia — Ranking de Padel para seu grupo" },
      {
        name: "twitter:description",
        content: "Crie seu grupo, registre partidas e acompanhe o ranking Elo.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://raqueteia.app/landing" },
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
