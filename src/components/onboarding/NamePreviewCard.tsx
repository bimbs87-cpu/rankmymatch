import { Trophy, MessageCircle, Swords } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { buildDisplayNames } from "@/lib/name-disambiguation";

interface Props {
  name: string;
  nickname: string;
  avatarUrl?: string | null;
}

/**
 * Shows three contextual previews of how the user will appear across the app
 * (ranking row, match header, comments). Helps the player decide between
 * full name and nickname before finishing onboarding.
 */
export function NamePreviewCard({ name, nickname, avatarUrl }: Props) {
  const trimmedName = name.trim() || "Seu nome";
  const trimmedNick = nickname.trim();

  // Use the same disambiguation helper the rest of the app uses, so the preview
  // matches reality. We seed a few neighbours so the algorithm has context.
  const labels = buildDisplayNames([
    { id: "me", name: trimmedName, nickname: trimmedNick || null },
    { id: "p2", name: "Carlos Silva" },
    { id: "p3", name: "Marina Costa" },
  ]);
  const myLabel = labels.get("me") || trimmedName;

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Como você vai aparecer no app
      </p>

      {/* 1) Ranking row */}
      <div className="rounded-2xl border border-border bg-background p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Trophy className="h-3 w-3 text-amber-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            No ranking
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-primary/5 px-3 py-2 ring-1 ring-primary/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-display flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              7
            </span>
            <PlayerAvatar avatarUrl={avatarUrl ?? null} name={trimmedName} size="sm" />
            <span className="truncate text-sm font-semibold text-foreground">{myLabel}</span>
          </div>
          <span className="font-display text-sm font-bold tabular-nums text-primary">1247</span>
        </div>
      </div>

      {/* 2) Match header */}
      <div className="rounded-2xl border border-border bg-background p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Swords className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Em uma partida
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <PlayerAvatar avatarUrl={avatarUrl ?? null} name={trimmedName} size="sm" />
            <span className="truncate text-xs font-semibold text-foreground">{myLabel}</span>
          </div>
          <span className="text-[10px] font-bold uppercase text-muted-foreground">vs</span>
          <span className="truncate text-xs font-semibold text-foreground">Carlos S.</span>
        </div>
      </div>

      {/* 3) Comments */}
      <div className="rounded-2xl border border-border bg-background p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <MessageCircle className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Em comentários
          </span>
        </div>
        <div className="flex items-start gap-2">
          <PlayerAvatar avatarUrl={avatarUrl ?? null} name={trimmedName} size="sm" />
          <div className="flex-1 rounded-xl rounded-tl-sm bg-muted/30 px-3 py-1.5">
            <p className="text-[11px] font-semibold text-foreground">{myLabel}</p>
            <p className="text-[11px] text-muted-foreground">Boa partida pessoal! 🎾</p>
          </div>
        </div>
      </div>
    </div>
  );
}
