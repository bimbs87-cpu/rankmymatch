/**
 * Shared rich profile body — used by both /players/$userId (public)
 * and /profile (own profile, "viewing" mode).
 *
 * Honors privacy_settings.
 * Ranking blocks (current Elo, weighted Elo, best position, form) are ALWAYS visible.
 */
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { EloEvolutionChart } from "@/components/EloEvolutionChart";
import {
  PlayerAvatarLink,
  PlayerNameLink,
} from "@/components/PlayerProfileViewer";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Flame,
  Swords,
  Target,
  Users,
  AtSign,
  Medal,
  Activity,
  Sparkles,
  Hand,
  MapPin,
  Crosshair,
} from "lucide-react";
import { abbreviateName } from "@/lib/utils";
import { loadH2HBetween, type H2HResult } from "@/lib/h2h";
import type {
  AggregatedProfile,
  AggregatedSummary,
  FormState,
} from "@/lib/aggregated-profile";

interface Props {
  profile: AggregatedProfile;
  summary: AggregatedSummary;
  eloHistory: { date: string; rating: number }[];
  /** Right-side actions on the hero (e.g. edit avatar button) */
  heroActions?: ReactNode;
  /** Show below header (used by own /profile to render menu) */
  footer?: ReactNode;
  /** When true, treat as the user viewing themselves (skip privacy gating) */
  isSelfView?: boolean;
  /** Logged-in viewer id — when set and != profile, loads H2H comigo block */
  viewerId?: string | null;
}

const HAND_LABEL: Record<string, string> = { right: "Destro", left: "Canhoto" };
const POS_LABEL: Record<string, string> = { left: "Esquerda", right: "Direita", both: "Ambos" };
const SHOT_LABEL: Record<string, string> = {
  none: "Nenhum",
  bandeja: "Bandeja",
  vibora: "Víbora",
  smash: "Smash",
  lob: "Lob",
  chiquita: "Chiquita",
  rulo: "Rulo",
  bajada: "Bajada",
  gancho: "Gancho",
};

function formText(state: FormState): { label: string; cls: string; icon: ReactNode } {
  if (state === "rising")
    return {
      label: "EM ALTA",
      cls: "bg-primary/15 text-primary border-primary/30",
      icon: <TrendingUp className="h-3.5 w-3.5" />,
    };
  if (state === "falling")
    return {
      label: "EM QUEDA",
      cls: "bg-destructive/15 text-destructive border-destructive/30",
      icon: <TrendingDown className="h-3.5 w-3.5" />,
    };
  return {
    label: "ESTÁVEL",
    cls: "bg-muted/40 text-muted-foreground border-border",
    icon: <Minus className="h-3.5 w-3.5" />,
  };
}

export function ProfileBody({
  profile,
  summary,
  eloHistory,
  heroActions,
  footer,
  isSelfView = false,
}: Props) {
  const showPersonal = isSelfView || profile.privacy.show_personal;
  const showStats = isSelfView || profile.privacy.show_stats;
  const showGroups = isSelfView || profile.privacy.show_groups;
  const showAchievements = isSelfView || profile.privacy.show_achievements;

  const form = formText(summary.formState);

  return (
    <div className="space-y-4 pb-28">
      {/* HERO */}
      <header className="relative overflow-hidden bg-card px-5 pb-7 pt-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-3">
              <PlayerAvatar
                avatarUrl={profile.avatar_url}
                name={profile.name}
                size="xl"
                className="border-2 border-border"
              />
              {heroActions ? (
                <div className="absolute bottom-0 right-0">{heroActions}</div>
              ) : null}
            </div>
            <h1 className="font-display text-2xl font-bold leading-tight text-foreground">
              {abbreviateName(profile.name)}
            </h1>
            {profile.nickname ? (
              <p className="text-sm text-muted-foreground">@{profile.nickname}</p>
            ) : null}
            {showPersonal && profile.instagram_handle ? (
              <a
                href={`https://instagram.com/${profile.instagram_handle}`}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <AtSign className="h-3 w-3" />
                {profile.instagram_handle}
              </a>
            ) : null}

            {/* Form badge */}
            <span
              className={`mt-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${form.cls}`}
            >
              {form.icon}
              {form.label}
            </span>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-5">
        {/* HEADLINE METRICS — always visible */}
        <section className="grid grid-cols-2 gap-2">
          <BigMetric
            label="Elo médio"
            value={summary.weightedElo != null ? String(summary.weightedElo) : "—"}
            sub={
              summary.trend30d !== 0
                ? `${summary.trend30d > 0 ? "+" : ""}${summary.trend30d} em 30d`
                : "estável em 30d"
            }
            tone={
              summary.trend30d > 0
                ? "primary"
                : summary.trend30d < 0
                ? "destructive"
                : "muted"
            }
          />
          <BigMetric
            label="Win rate"
            value={summary.totalMatches > 0 ? `${summary.winRate}%` : "—"}
            sub={`${summary.totalWins}V • ${summary.totalMatches - summary.totalWins}D`}
            tone="primary"
          />
        </section>

        {/* Last 10 + best position */}
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Últimos 10 jogos
            </p>
            {summary.last10.length ? (
              <div className="mt-2 flex gap-1.5">
                {summary.last10.map((r, i) => (
                  <span
                    key={i}
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                      r === "W"
                        ? "bg-primary/20 text-primary"
                        : "bg-destructive/20 text-destructive"
                    }`}
                  >
                    {r === "W" ? "V" : "D"}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Sem jogos recentes</p>
            )}
          </div>

          {summary.bestPosition ? (
            <div className="rounded-3xl border border-primary/30 bg-primary/5 p-4">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Trophy className="h-3 w-3 text-primary" /> Melhor posição
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-foreground">
                #{summary.bestPosition.pos}
              </p>
              <p className="text-xs text-muted-foreground">
                em <span className="text-foreground">{summary.bestPosition.group}</span>
                {summary.bestPosition.season ? ` · ${summary.bestPosition.season}` : ""}
              </p>
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-4">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Trophy className="h-3 w-3" /> Melhor posição
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Aguardando ranking</p>
            </div>
          )}
        </section>

        {/* PERSONAL */}
        {showPersonal && (
          profile.dominant_hand ||
            profile.preferred_position ||
            profile.killer_shot ||
            profile.worst_shot
        ) ? (
          <section className="rounded-3xl border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Sobre o atleta
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {profile.dominant_hand ? (
                <ChipStat icon={<Hand className="h-3 w-3" />} label="Mão" value={HAND_LABEL[profile.dominant_hand] ?? "—"} />
              ) : null}
              {profile.preferred_position ? (
                <ChipStat icon={<MapPin className="h-3 w-3" />} label="Posição" value={POS_LABEL[profile.preferred_position] ?? "—"} />
              ) : null}
              {profile.killer_shot && profile.killer_shot !== "none" ? (
                <ChipStat icon={<Crosshair className="h-3 w-3" />} label="Golpe" value={SHOT_LABEL[profile.killer_shot] ?? profile.killer_shot} tone="primary" />
              ) : null}
              {profile.worst_shot && profile.worst_shot !== "none" ? (
                <ChipStat icon={<Target className="h-3 w-3" />} label="Fraqueza" value={SHOT_LABEL[profile.worst_shot] ?? profile.worst_shot} tone="destructive" />
              ) : null}
            </div>
          </section>
        ) : null}

        {/* DETAILED STATS + CHART */}
        {showStats ? (
          <>
            {eloHistory.length > 1 ? (
              <section className="overflow-hidden rounded-3xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" /> Evolução do Elo
                  </h3>
                </div>
                <div className="mt-2 h-56 w-full overflow-hidden">
                  <EloEvolutionChart points={eloHistory} defaultPeriod="all" />
                </div>
              </section>
            ) : null}

            <section className="grid grid-cols-3 gap-2">
              <SmallStat label="Partidas" value={summary.totalMatches} />
              <SmallStat label="Sets vencidos" value={summary.totalSetsWon} />
              <SmallStat
                label="Maior streak"
                value={summary.maxWinStreak}
                icon={<Flame className="h-3 w-3 text-destructive" />}
              />
            </section>
          </>
        ) : (
          <PrivacyHidden label="Estatísticas detalhadas ocultadas pelo jogador" />
        )}

        {/* RIVAL / NEMESIS */}
        {showGroups && (summary.rival || summary.bestVictim) ? (
          <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {summary.rival ? (
              <RivalCard
                tone="destructive"
                title="Rival"
                subtitle={`${summary.rival.lost}/${summary.rival.faced} derrotas`}
                user={summary.rival}
                icon={<Swords className="h-4 w-4" />}
              />
            ) : null}
            {summary.bestVictim ? (
              <RivalCard
                tone="primary"
                title="Vítima preferida"
                subtitle={`${summary.bestVictim.won}/${summary.bestVictim.faced} vitórias`}
                user={summary.bestVictim}
                icon={<Target className="h-4 w-4" />}
              />
            ) : null}
          </section>
        ) : null}

        {/* GROUPS */}
        {showGroups ? (
          summary.groups.length ? (
            <section className="rounded-3xl border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Grupos ({summary.groups.length})
              </h3>
              <div className="space-y-1">
                {summary.groups.map((g) => (
                  <Link
                    key={g.id}
                    to="/groups/$groupId"
                    params={{ groupId: g.id }}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-accent"
                  >
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted/40">
                      {g.image_url ? (
                        <img src={g.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
                          {g.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="flex-1 truncate text-sm font-medium text-foreground">{g.name}</span>
                    {g.rating != null ? (
                      <span className="text-xs font-bold tabular-nums text-primary">
                        {Math.round(g.rating)}
                      </span>
                    ) : null}
                    <span className="text-[10px] text-muted-foreground tabular-nums">{g.matches}j</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null
        ) : (
          <PrivacyHidden label="Grupos ocultados pelo jogador" />
        )}

        {/* ACHIEVEMENTS placeholder */}
        {showAchievements ? (
          summary.bestPosition?.pos === 1 ? (
            <section className="rounded-3xl border border-primary/30 bg-primary/5 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                <Medal className="h-3.5 w-3.5" /> Conquistas
              </h3>
              <p className="text-sm text-foreground">
                🏆 Já foi <span className="font-bold">#1</span> em {summary.bestPosition.group}
              </p>
            </section>
          ) : null
        ) : (
          <PrivacyHidden label="Conquistas ocultadas pelo jogador" />
        )}

        {footer}
      </div>
    </div>
  );
}

// ---- atoms ----

function BigMetric({
  label,
  value,
  sub,
  tone = "primary",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "destructive" | "muted";
}) {
  const subColor =
    tone === "destructive"
      ? "text-destructive"
      : tone === "muted"
      ? "text-muted-foreground"
      : "text-primary";
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums text-foreground">
        {value}
      </p>
      {sub ? <p className={`text-xs ${subColor}`}>{sub}</p> : null}
    </div>
  );
}

function SmallStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-3">
      <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="mt-0.5 font-display text-lg font-bold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function ChipStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: "primary" | "destructive";
}) {
  const cls =
    tone === "primary"
      ? "border-primary/30 bg-primary/5 text-primary"
      : tone === "destructive"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : "border-border bg-background text-foreground";
  return (
    <div className={`rounded-2xl border p-2.5 ${cls}`}>
      <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-xs font-bold">{value}</p>
    </div>
  );
}

function RivalCard({
  tone,
  title,
  subtitle,
  user,
  icon,
}: {
  tone: "primary" | "destructive";
  title: string;
  subtitle: string;
  user: { user_id: string; name: string; avatar_url: string | null };
  icon: ReactNode;
}) {
  const cls =
    tone === "primary"
      ? "border-primary/30 bg-primary/5"
      : "border-destructive/30 bg-destructive/5";
  const accent = tone === "primary" ? "text-primary" : "text-destructive";
  return (
    <div className={`flex items-center gap-3 rounded-3xl border p-3 ${cls}`}>
      <PlayerAvatarLink userId={user.user_id} ariaLabel={`Ver perfil de ${user.name}`}>
        <PlayerAvatar avatarUrl={user.avatar_url} name={user.name} size="lg" />
      </PlayerAvatarLink>
      <div className="min-w-0 flex-1">
        <p className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${accent}`}>
          {icon}
          {title}
        </p>
        <PlayerNameLink userId={user.user_id} className="block truncate text-sm font-bold text-foreground">
          {abbreviateName(user.name)}
        </PlayerNameLink>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function PrivacyHidden({ label }: { label: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border/70 bg-card/40 p-4 text-center text-xs text-muted-foreground">
      🔒 {label}
    </div>
  );
}
