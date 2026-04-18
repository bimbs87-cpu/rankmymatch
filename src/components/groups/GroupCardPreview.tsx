import { Globe, Lock, EyeOff, Users, Crown } from "lucide-react";

interface Props {
  name: string;
  description?: string | null;
  visibility: string; // public | private | hidden
  imageUrl?: string | null;
  memberCount?: number;
  matchFormat?: string; // singles | doubles
  sport?: string; // padel | tennis
  isPremium?: boolean;
}

/**
 * Live preview of how the group card will look in Explore.
 * Mirrors the markup in ExplorePanel's card.
 */
export function GroupCardPreview({
  name,
  description,
  visibility,
  imageUrl,
  memberCount = 1,
  matchFormat = "doubles",
  sport = "padel",
  isPremium = false,
}: Props) {
  const VisIcon = visibility === "public" ? Globe : visibility === "hidden" ? EyeOff : Lock;
  const visLabel =
    visibility === "public"
      ? "Aparece em Explorar"
      : visibility === "hidden"
        ? "Oculto — só por convite"
        : "Visível em Explorar (privado)";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Pré-visualização do card
        </span>
        <span className="text-[10px] text-muted-foreground">{visLabel}</span>
      </div>
      <div className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full rounded-xl object-cover" />
          ) : (
            <Users className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-foreground">
              {name?.trim() || "Nome do grupo"}
            </span>
            <VisIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            {isPremium && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--rank-gold)]/15 px-1.5 py-0.5 text-[9px] font-bold text-[var(--rank-gold)] ring-1 ring-[var(--rank-gold)]/40">
                <Crown className="h-2.5 w-2.5" />
                PREMIUM
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {memberCount} membro{memberCount !== 1 ? "s" : ""} ·{" "}
            {matchFormat === "singles" ? "Singles" : "Doubles"} ·{" "}
            {sport === "tennis" ? "Tênis" : "Padel"}
          </p>
          {description?.trim() && (
            <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground/80">
              {description}
            </p>
          )}
        </div>
      </div>
      {visibility === "hidden" && (
        <p className="text-[10px] text-muted-foreground">
          Em Explorar este card <span className="font-semibold text-foreground">não</span> aparecerá. Acima é como ele
          ficaria caso você troque para Público ou Privado.
        </p>
      )}
    </div>
  );
}
