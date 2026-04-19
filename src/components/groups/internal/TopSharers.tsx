import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";

interface Props {
  groupId: string;
  /** Lookback in days. Defaults to 30. */
  days?: number;
}

interface SharerRow {
  user_id: string;
  count: number;
  name: string;
  avatar_url: string | null;
}

/**
 * Shows the top 3 members by share-event count over the last N days,
 * so admins can recognize who's driving organic growth.
 */
export function TopSharers({ groupId, days = 30 }: Props) {
  const [rows, setRows] = useState<SharerRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data: events } = await supabase
        .from("group_share_events")
        .select("user_id")
        .eq("group_id", groupId)
        .gte("created_at", since)
        .not("user_id", "is", null);

      if (cancelled) return;
      const counts = new Map<string, number>();
      for (const e of events || []) {
        if (!e.user_id) continue;
        counts.set(e.user_id, (counts.get(e.user_id) || 0) + 1);
      }
      const top = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (top.length === 0) {
        setRows([]);
        return;
      }

      const { data: profs } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname, avatar_url")
        .in("user_id", top.map(([id]) => id));

      const profMap = new Map((profs || []).map((p) => [p.user_id, p]));
      if (cancelled) return;
      setRows(
        top.map(([user_id, count]) => {
          const p = profMap.get(user_id);
          return {
            user_id,
            count,
            name: p?.nickname || p?.name || "Membro",
            avatar_url: p?.avatar_url ?? null,
          };
        }),
      );
    })();
    return () => { cancelled = true; };
  }, [groupId, days]);

  if (rows === null) return null;
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-3 text-[11px] text-muted-foreground">
        Sem compartilhamentos identificados nos últimos {days} dias.
      </div>
    );
  }

  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
        <Trophy className="h-3 w-3 text-warning" /> Top divulgadores · últimos {days}d
      </div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.user_id} className="flex items-center gap-2">
            <span className="w-5 text-center text-sm">{medals[i]}</span>
            <PlayerAvatar avatarUrl={r.avatar_url} name={r.name} size="xs" />
            <span className="flex-1 truncate text-xs text-foreground">{r.name}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {r.count}×
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
