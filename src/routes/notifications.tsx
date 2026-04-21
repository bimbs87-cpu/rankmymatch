import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Calendar,
  Shuffle,
  MessageSquare,
  ArrowUpCircle,
  Swords,
  Undo2,
} from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { PushOptInCard } from "@/components/PushOptInCard";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notificações — RankMyMatch" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NotificationsPage,
});

const iconMap: Record<string, typeof Bell> = {
  round_created: Calendar,
  draw_completed: Shuffle,
  new_comment: MessageSquare,
  match_promoted: ArrowUpCircle,
  match_unpromoted: Undo2,
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function NotificationsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [authLoading, isAuthenticated, navigate]);
  const { notifications, unreadCount, isLoading, markAllRead, markRead } = useNotifications();

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="flex items-center justify-between px-5 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <Link to="/" className="rounded-full border border-border bg-card p-2 transition-colors hover:bg-accent">
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <h1 className="font-display text-lg font-bold text-foreground">Notificações</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="rounded-full border border-border bg-card p-2 transition-colors hover:bg-accent"
          >
            <CheckCheck className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </header>

      <div className="px-5 pt-4">
        <div className="mb-4">
          <PushOptInCard />
        </div>
        {isLoading ? (
          <TrophyLoadingBar fullScreen={false} compact />
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-8 text-center">
            <Bell className="h-10 w-10 text-muted-foreground/20" />
            <h3 className="font-display text-base font-bold text-foreground">Tudo em dia!</h3>
            <p className="text-sm text-muted-foreground">
              Você receberá notificações sobre rodadas, resultados e ranking aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const Icon = iconMap[n.type] || Bell;
              const isPromoted = n.type === "match_promoted";
              const isUnpromoted = n.type === "match_unpromoted";
              const data = (n.data || {}) as {
                match_id?: string;
                season_id?: string | null;
                seasonId?: string;
                round_id?: string;
                roundId?: string;
                groupId?: string;
              };
              const groupId = n.group_id || data.groupId;
              const seasonId = data.season_id || data.seasonId;
              const roundId = data.round_id || data.roundId;

              const handleClick = async () => {
                if (!n.read) await markRead(n.id);
                if ((isPromoted || isUnpromoted) && groupId) {
                  navigate({ to: "/groups/$groupId/duel", params: { groupId } });
                  return;
                }
                if (groupId && seasonId && roundId) {
                  navigate({
                    to: "/groups/$groupId",
                    params: { groupId },
                    search: { view: "seasons", season: seasonId, round: roundId } as any,
                  });
                  return;
                }
                if (groupId && seasonId) {
                  navigate({
                    to: "/groups/$groupId/seasons/$seasonId",
                    params: { groupId, seasonId },
                  });
                  return;
                }
                if (groupId) {
                  navigate({ to: "/groups/$groupId", params: { groupId } });
                }
              };

              // Highlighted styling for promotion-related events
              const baseCls = isPromoted
                ? n.read
                  ? "border-primary/20 bg-primary/5"
                  : "border-primary/40 bg-gradient-to-br from-primary/15 to-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]"
                : isUnpromoted
                ? n.read
                  ? "border-warning/20 bg-warning/5"
                  : "border-warning/40 bg-warning/10"
                : n.read
                ? "border-border bg-card/30"
                : "border-primary/20 bg-primary/5";

              const iconWrapCls = isPromoted
                ? "bg-primary/15"
                : isUnpromoted
                ? "bg-warning/15"
                : n.read
                ? "bg-muted"
                : "bg-primary/10";

              const iconCls = isPromoted
                ? "text-primary"
                : isUnpromoted
                ? "text-warning"
                : n.read
                ? "text-muted-foreground"
                : "text-primary";

              return (
                <button
                  key={n.id}
                  onClick={handleClick}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-all ${baseCls} ${
                    groupId ? "active:scale-[0.99] cursor-pointer" : "cursor-default"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconWrapCls}`}
                  >
                    <Icon className={`h-4 w-4 ${iconCls}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {isPromoted && (
                      <div className="mb-1 flex items-center gap-1.5">
                        <Swords className="h-3 w-3 text-primary" />
                        <span className="text-[9px] font-bold uppercase tracking-wider text-primary">
                          Duelo · Ranking
                        </span>
                      </div>
                    )}
                    <p
                      className={`text-sm font-semibold ${
                        n.read && !isPromoted && !isUnpromoted
                          ? "text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                    )}
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground/60">{timeAgo(n.created_at)}</p>
                      {(isPromoted || isUnpromoted) && groupId && (
                        <span className="text-[10px] font-semibold text-primary">
                          Abrir duelo →
                        </span>
                      )}
                    </div>
                  </div>
                  {!n.read && (
                    <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
