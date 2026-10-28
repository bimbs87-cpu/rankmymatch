import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { LandingPage } from "@/components/LandingPage";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Raqueteia" },
      { name: "description", content: "Acesse sua conta no Raqueteia e gerencie seus rankings, temporadas e grupos." },
      { property: "og:title", content: "Entrar no Raqueteia" },
      { property: "og:description", content: "Login com Google em segundos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://raqueteia.app/login" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  useEffect(() => {
    if (!isLoading && isAuthenticated) void navigate({ to: "/" });
  }, [isAuthenticated, isLoading, navigate]);
  if (isLoading) return <TrophyLoadingBar />;
  if (isAuthenticated) return null;
  return <LandingPage />;
}
