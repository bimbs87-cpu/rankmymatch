import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface RatingPoint {
  date: string;
  rating: number;
  change: number;
  label: string;
  position?: number | null;
}

export function EloChart({ userId }: { userId: string }) {
  const [data, setData] = useState<RatingPoint[]>([]);
  const [seasons, setSeasons] = useState<{ id: string; name: string }[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: events } = await supabase
        .from("rating_events")
        .select("season_id")
        .eq("user_id", userId);

      const seasonIds = [...new Set((events || []).map((e) => e.season_id).filter(Boolean))] as string[];

      if (seasonIds.length) {
        const { data: s } = await supabase
          .from("seasons")
          .select("id, name")
          .in("id", seasonIds);
        setSeasons(s || []);
      }
    }
    load();
  }, [userId]);

  useEffect(() => {
    async function loadRatings() {
      setIsLoading(true);
      let query = supabase
        .from("rating_events")
        .select("rating_after, rating_change, created_at, season_id, match_id, user_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (selectedSeason !== "all") {
        query = query.eq("season_id", selectedSeason);
      }

      const { data: events } = await query;

      if (events?.length) {
        // Fetch all rating_events for relevant seasons to compute positions
        const relevantSeasonIds = [...new Set(events.map((e) => e.season_id).filter(Boolean))] as string[];
        let allEventsForSeasons: any[] = [];

        if (relevantSeasonIds.length > 0) {
          const { data: allEvents } = await supabase
            .from("rating_events")
            .select("user_id, rating_after, match_id, created_at, season_id")
            .in("season_id", relevantSeasonIds)
            .order("created_at", { ascending: true });
          allEventsForSeasons = allEvents || [];
        }

        // Track each user's latest rating to compute positions at each match
        const userLatestRating = new Map<string, number>();
        const matchSet = new Set(events.map((e) => e.match_id));

        const allSorted = [...allEventsForSeasons].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        // Group events by match_id to process all players of a match together
        const eventsByMatch: Map<string, typeof allSorted> = new Map();
        for (const ev of allSorted) {
          const list = eventsByMatch.get(ev.match_id) || [];
          list.push(ev);
          eventsByMatch.set(ev.match_id, list);
        }

        const positionAtMatch = new Map<string, number>();

        // Process matches in chronological order (by first event's created_at)
        const matchIds = [...eventsByMatch.keys()];
        for (const matchId of matchIds) {
          const matchEvents = eventsByMatch.get(matchId)!;
          // Update all players' ratings for this match first
          for (const ev of matchEvents) {
            userLatestRating.set(ev.user_id, Number(ev.rating_after));
          }
          // Then compute position if this match belongs to our user
          if (matchSet.has(matchId)) {
            const ratings = [...userLatestRating.values()].sort((a, b) => b - a);
            const myRating = userLatestRating.get(userId)!;
            // Count how many players have a strictly higher rating
            const pos = ratings.filter((r) => r > myRating).length + 1;
            positionAtMatch.set(matchId, pos);
          }
        }

        const points: RatingPoint[] = [
          {
            date: "",
            rating: events[0].rating_after - events[0].rating_change,
            change: 0,
            label: "Início",
            position: null,
          },
          ...events.map((e, i) => ({
            date: new Date(e.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
            }),
            rating: Number(e.rating_after),
            change: Number(e.rating_change),
            label: `Set ${i + 1}`,
            position: positionAtMatch.get(e.match_id) || null,
          })),
        ];
        setData(points);
      } else {
        setData([]);
      }
      setIsLoading(false);
    }
    loadRatings();
  }, [userId, selectedSeason]);

  const currentRating = data.length > 0 ? data[data.length - 1].rating : 1000;
  const totalChange = data.length > 1 ? currentRating - data[0].rating : 0;
  const minRating = data.length > 0 ? Math.min(...data.map((d) => d.rating)) - 20 : 980;
  const maxRating = data.length > 0 ? Math.max(...data.map((d) => d.rating)) + 20 : 1020;

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;
    return (
      <g>
        <circle cx={cx} cy={cy} r={3} fill="#c8ff00" strokeWidth={0} />
        {payload.position && (
          <text
            x={cx}
            y={cy - 10}
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontSize={9}
            fontWeight={600}
          >
            #{payload.position}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Evolução Elo</h3>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-display text-2xl font-bold text-foreground">
              {Math.round(currentRating)}
            </span>
            {totalChange !== 0 && (
              <span
                className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                  totalChange > 0
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {totalChange > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {totalChange > 0 ? "+" : ""}
                {Math.round(totalChange)}
              </span>
            )}
            {totalChange === 0 && data.length > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                <Minus className="h-3 w-3" />0
              </span>
            )}
          </div>
        </div>

        {seasons.length > 0 && (
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="all">Todas</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : data.length < 2 ? (
        <div className="flex h-48 flex-col items-center justify-center text-center">
          <p className="text-sm text-muted-foreground">
            Jogue pelo menos uma partida para ver seu gráfico
          </p>
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 18, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" opacity={0.4} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[minRating, maxRating]}
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine
                y={1000}
                stroke="rgba(255,255,255,0.3)"
                strokeDasharray="4 4"
                opacity={0.3}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(30,30,40,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.9)",
                }}
                formatter={(value: any, _name: any, props: any) => {
                  const change = props.payload.change;
                  const pos = props.payload.position;
                  const changeStr = change > 0 ? `+${change}` : `${change}`;
                  const posStr = pos ? ` · #${pos}` : "";
                  return [`${Math.round(Number(value))} (${changeStr}${posStr})`, "Rating"];
                }}
                labelFormatter={(label: any) => String(label)}
              />
              <Line
                type="monotone"
                dataKey="rating"
                stroke="#c8ff00"
                strokeWidth={2.5}
                dot={<CustomDot />}
                activeDot={{ r: 5, fill: "#c8ff00", strokeWidth: 2, stroke: "rgba(30,30,40,1)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
