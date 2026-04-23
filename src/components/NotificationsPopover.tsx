/**
 * Floating notifications menu (popover) — replaces the full-page jump
 * when tapping the bell icon. Clicking a notification routes the user
 * directly to the underlying event (round, match, season, duel...).
 *
 * A "Ver todas" footer link still opens /notifications for the full list.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Calendar,
  Shuffle,
  MessageSquare,
  ArrowUpCircle,
  Undo2,
  Swords,
  Trophy,
  Loader2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/use-notifications";

const iconMap: Record<string, typeof Bell> = {
  round_created: Calendar,
  round_open: Calendar,
  round_urgent: Calendar,
  draw_completed: Shuffle,
  new_comment: MessageSquare,
  match_promoted: ArrowUpCircle,
  match_unpromoted: Undo2,
  season_created: Trophy,
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

interface NotificationData {
  match_id?: string;
  round_id?: string;
  roundId?: string;
  season_id?: string;
  seasonId?: string;
  groupId?: string;
}

interface Props {
  /** Element rendered as the trigger (usually a styled bell button). */
  children: React.ReactNode;
}

export function NotificationsPopover({ children }: Props) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markAllRead, markRead } = useNotifications();
  const recent = notifications.slice(0, 8);

  // Guard against concurrent markAllRead calls when the popover is opened
  // and closed rapidly (or re-opened before the previous call settles).
  const markingRef = useRef(false);
  const lastMarkedAtRef = useRef(0);

  // Auto-mark all as read when the popover opens. We do this in the
  // background (no spinner) so the indicator clears instantly and the user
  // sees a clean state without flicker.
  useEffect(() => {
    if (!open || unreadCount === 0) return;
    if (markingRef.current) return;
    if (Date.now() - lastMarkedAtRef.current < 1500) return;

    markingRef.current = true;
    void (async () => {
      try {
        await markAllRead();
        lastMarkedAtRef.current = Date.now();
      } finally {
        markingRef.current = false;
      }
    })();
  }, [open, unreadCount, markAllRead]);

  const handleClick = async (n: (typeof notifications)[number]) => {
    if (!n.read) await markRead(n.id);
    setOpen(false);

    const data = (n.data || {}) as NotificationData;
    const groupId = n.group_id || data.groupId;
    const seasonId = data.season_id || data.seasonId;
    const roundId = data.round_id || data.roundId;

    // Route to the most specific event we can resolve.
    if ((n.type === "match_promoted" || n.type === "match_unpromoted") && groupId) {
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
      return;
    }
    navigate({ to: "/notifications" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-2rem))] border-border bg-card p-0"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-display text-sm font-bold text-foreground">Notificações</h3>
          {isMarking && (
            <span
              className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground"
              aria-live="polite"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              Marcando como lidas…
            </span>
          )}
        </header>

        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {isLoading ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">Carregando…</div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">Tudo em dia!</p>
              <p className="text-[11px] text-muted-foreground">
                Você verá rodadas, resultados e ranking aqui.
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {recent.map((n) => {
                const Icon = iconMap[n.type] || Bell;
                const isPromoted = n.type === "match_promoted";
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => void handleClick(n)}
                      className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent ${
                        !n.read ? "bg-primary/5" : ""
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          isPromoted
                            ? "bg-primary/15"
                            : !n.read
                            ? "bg-primary/10"
                            : "bg-muted"
                        }`}
                      >
                        <Icon
                          className={`h-3.5 w-3.5 ${
                            isPromoted || !n.read ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        {isPromoted && (
                          <div className="mb-0.5 flex items-center gap-1">
                            <Swords className="h-2.5 w-2.5 text-primary" />
                            <span className="text-[8px] font-bold uppercase tracking-wider text-primary">
                              Duelo
                            </span>
                          </div>
                        )}
                        <p
                          className={`line-clamp-1 text-xs font-semibold ${
                            n.read ? "text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="line-clamp-2 text-[11px] text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                      {!n.read && (
                        <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-border px-2 py-2">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2 text-center text-xs font-semibold text-primary transition-colors hover:bg-accent"
          >
            Ver todas as notificações →
          </Link>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
