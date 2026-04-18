import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, CheckCheck, Calendar, Shuffle, MessageSquare } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

const iconMap: Record<string, typeof Bell> = {
  round_created: Calendar,
  draw_completed: Shuffle,
  new_comment: MessageSquare,
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
              return (
                <button
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                    n.read
                      ? "border-border bg-card/30"
                      : "border-primary/20 bg-primary/5"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      n.read ? "bg-muted" : "bg-primary/10"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${n.read ? "text-muted-foreground" : "text-primary"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${n.read ? "text-muted-foreground" : "text-foreground"}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/60">{timeAgo(n.created_at)}</p>
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
