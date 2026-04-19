import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Per-event push notification preferences.
 *
 * Defaults to ON (opt-out). When a row is missing for a given event type, it
 * is treated as enabled — so existing users keep getting all push types until
 * they explicitly disable one.
 */
export const PUSH_EVENT_TYPES = [
  {
    key: "round_open",
    label: "Lista de presença abriu",
    description: "Aviso quando a janela natural de confirmação abre.",
  },
  {
    key: "round_urgent",
    label: "Vaga restando perto da rodada",
    description: "Quando faltam horas para o jogo e ainda há vagas.",
  },
  {
    key: "match_promoted",
    label: "Resultado promovido / oficializado",
    description: "Quando um resultado seu vira oficial e mexe no Elo.",
  },
  {
    key: "comment",
    label: "Novos comentários",
    description: "Mencionado em uma rodada ou comentaram seu resultado.",
  },
  {
    key: "general",
    label: "Outras notificações do grupo",
    description: "Convites, mudanças de temporada e avisos gerais.",
  },
] as const;

export type PushEventKey = (typeof PUSH_EVENT_TYPES)[number]["key"];

export function usePushPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setPrefs({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("push_notification_preferences")
      .select("event_type, enabled")
      .eq("user_id", user.id);
    const map: Record<string, boolean> = {};
    for (const row of data || []) map[row.event_type] = row.enabled;
    setPrefs(map);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const isEnabled = (key: string) => prefs[key] !== false; // default ON

  const toggle = useCallback(
    async (key: string, enabled: boolean) => {
      if (!user) return;
      // Optimistic
      setPrefs((p) => ({ ...p, [key]: enabled }));
      await supabase
        .from("push_notification_preferences")
        .upsert(
          { user_id: user.id, event_type: key, enabled },
          { onConflict: "user_id,event_type" },
        );
    },
    [user],
  );

  return { prefs, isEnabled, toggle, loading, reload: load };
}
