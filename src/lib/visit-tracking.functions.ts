import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const visit = z.object({
  session_id: z.string().max(100),
  path: z.string().startsWith("/").max(500),
  referrer_host: z.string().max(255).nullable(),
  utm_source: z.string().max(255).nullable(),
  utm_medium: z.string().max(255).nullable(),
  utm_campaign: z.string().max(255).nullable(),
  invite_code: z.string().max(100).nullable(),
  user_agent: z.string().max(255),
  is_first_visit: z.boolean(),
  device_type: z.enum(["mobile", "tablet", "desktop"]),
});

export const recordPageVisit = createServerFn({ method: "POST" })
  .inputValidator((data) => visit.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest();
    const origin = request.headers.get("origin");
    // Browser-origin submissions only; do not make the privileged client a public write proxy.
    if (!origin || new URL(origin).host !== new URL(request.url).host) throw new Error("Invalid origin");
    if (/^\/(?:api|dev|admin|lovable)(?:\/|$)/.test(data.path)) return { ok: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const user = token ? (await supabaseAdmin.auth.getUser(token)).data.user : null;
    const { error } = await supabaseAdmin.from("page_visits").insert({
      ...data,
      user_id: user?.id ?? null,
      user_agent: request.headers.get("user-agent")?.slice(0, 255) ?? data.user_agent,
    });
    if (error) throw new Error("Failed to record visit");
    return { ok: true };
  });