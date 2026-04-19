import { useEffect, useMemo, useState } from "react";
import { Share2, Loader2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  groupId: string;
  /** Number of weeks to display. Defaults to 8. */
  weeks?: number;
}

const CHANNELS = [
  { id: "copy",     label: "Link",      color: "hsl(var(--primary))" },
  { id: "native",   label: "Nativo",    color: "hsl(var(--success))" },
  { id: "qr",       label: "QR",        color: "hsl(var(--warning))" },
  { id: "image",    label: "Imagem",    color: "hsl(var(--info))" },
  { id: "whatsapp", label: "WhatsApp",  color: "#25D366" },
] as const;

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay();
  const diff = (day + 6) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}

function fmtWeekLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Weekly share-by-channel line chart for the Engajamento section.
 * Helps admins see which channels members actually use to invite people.
 */
export function ShareChannelsChart({ groupId, weeks = 8 }: Props) {
  const [events, setEvents] = useState<{ channel: string; created_at: string }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString();
      const { data } = await supabase
        .from("group_share_events")
        .select("channel, created_at")
        .eq("group_id", groupId)
        .gte("created_at", since);
      if (!cancelled) setEvents(data || []);
    })();
    return () => { cancelled = true; };
  }, [groupId, weeks]);

  const data = useMemo(() => {
    if (!events) return [];
    const buckets = new Map<string, Record<string, number | string>>();
    const now = new Date();
    let cursor = startOfWeek(new Date(Date.now() - (weeks - 1) * 7 * 86400000));
    const end = startOfWeek(now);
    while (cursor.getTime() <= end.getTime()) {
      const key = cursor.toISOString().slice(0, 10);
      const row: Record<string, number | string> = { bucket: fmtWeekLabel(cursor) };
      for (const c of CHANNELS) row[c.label] = 0;
      buckets.set(key, row);
      cursor = new Date(cursor.getTime() + 7 * 86400000);
    }
    for (const ev of events) {
      const k = startOfWeek(new Date(ev.created_at)).toISOString().slice(0, 10);
      const row = buckets.get(k);
      if (!row) continue;
      const ch = CHANNELS.find((c) => c.id === ev.channel);
      if (!ch) continue;
      row[ch.label] = ((row[ch.label] as number) || 0) + 1;
    }
    return Array.from(buckets.values());
  }, [events, weeks]);

  const total = useMemo(
    () => (events || []).filter((e) => e.channel !== "preview").length,
    [events],
  );

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <Share2 className="h-3 w-3" /> Compartilhamentos por canal · {weeks} semanas
        </div>
        <span className="text-[10px] text-muted-foreground">{total} no total</span>
      </div>
      {events === null ? (
        <div className="flex h-44 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : total === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 text-[11px] text-muted-foreground">
          Nenhum compartilhamento registrado ainda.
        </div>
      ) : (
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 11,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {CHANNELS.map((c) => (
                <Line
                  key={c.id}
                  type="monotone"
                  dataKey={c.label}
                  stroke={c.color}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
