import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/push/vapid-public-key")({
  server: {
    handlers: {
      GET: async () => {
        const publicKey = process.env.VAPID_PUBLIC_KEY || "";
        return new Response(JSON.stringify({ publicKey }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
