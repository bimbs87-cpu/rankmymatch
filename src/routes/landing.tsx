import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/LandingPage";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "RankMyMatch — Preview da Landing Page" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LandingPage,
});
