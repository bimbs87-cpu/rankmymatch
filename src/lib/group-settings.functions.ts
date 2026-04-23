import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Allowed visibility values. Mirrors the DB constraint conceptually:
 *  - public: appears in Explorar, anyone can see content
 *  - private: appears in Explorar, only members see content
 *  - hidden: NOT in Explorar — only via direct invite link
 */
export const VISIBILITY_VALUES = ["public", "private", "hidden"] as const;
export type Visibility = (typeof VISIBILITY_VALUES)[number];

const InputSchema = z.object({
  groupId: z.string().uuid("groupId inválido"),
  visibility: z.enum(VISIBILITY_VALUES, {
    errorMap: () => ({
      message: `visibility deve ser um de: ${VISIBILITY_VALUES.join(", ")}`,
    }),
  }),
});

/**
 * Updates ONLY the visibility field of a group, with strict server-side
 * validation. Any other field changes go through the regular client flow.
 *
 * Returns:
 *  { ok: true, oldVisibility, newVisibility } on success
 *  { ok: false, error } on validation/permission failure (HTTP 200, app-level error)
 */
export const updateGroupVisibilityServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { groupId, visibility } = data;

    // Load current group to verify creator/admin and get old value
    const { data: group, error: loadErr } = await supabase
      .from("groups")
      .select("id, visibility, created_by")
      .eq("id", groupId)
      .maybeSingle();

    if (loadErr) {
      return { ok: false as const, error: `Falha ao ler grupo: ${loadErr.message}` };
    }
    if (!group) {
      return { ok: false as const, error: "Grupo não encontrado" };
    }

    // Only creator or active admin may change visibility.
    if (group.created_by !== userId) {
      const { data: isAdmin } = await supabase.rpc("is_group_admin", {
        _user_id: userId,
        _group_id: groupId,
      });
      if (!isAdmin) {
        return { ok: false as const, error: "Apenas administradores podem alterar a visibilidade" };
      }
    }

    const oldVisibility = (group.visibility as Visibility | null) || "public";

    if (oldVisibility === visibility) {
      return { ok: true as const, oldVisibility, newVisibility: visibility, changed: false };
    }

    const { error: updateErr } = await supabase
      .from("groups")
      .update({
        visibility,
        is_public: visibility === "public",
      })
      .eq("id", groupId);

    if (updateErr) {
      return { ok: false as const, error: `Falha ao salvar: ${updateErr.message}` };
    }

    // Audit log (best effort — RLS allows authenticated insert with own user_id)
    await supabase
      .from("audit_logs")
      .insert({
        user_id: userId,
        group_id: groupId,
        action: "group_visibility_changed",
        entity_type: "group",
        entity_id: groupId,
        old_data: { visibility: oldVisibility },
        new_data: { visibility },
      })
      .then(() => undefined, () => undefined);

    return { ok: true as const, oldVisibility, newVisibility: visibility, changed: true };
  });
