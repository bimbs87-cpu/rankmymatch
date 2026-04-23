import { Link } from "@tanstack/react-router";
import { Search, Users, Globe, Lock, Filter, SlidersHorizontal, Compass, Crown, EyeOff, Copy, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { usePublicGroups } from "@/hooks/use-groups";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

async function assertCanInvite(groupId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("group_members")
    .select("role, status")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["admin", "creator"])
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Você não tem permissão para gerar convites deste grupo.");
}

interface InviteInfo {
  url: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
}

async function getOrCreateInviteUrl(groupId: string, userId: string): Promise<InviteInfo> {
  // Defensive server-side check: only admins/creators can mint invites here.
  await assertCanInvite(groupId, userId);

  const { data: existing } = await supabase
    .from("invite_links")
    .select("code, expires_at, max_uses, use_count")
    .eq("group_id", groupId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5);

  const usable = (existing || []).find(
    (l) =>
      (!l.expires_at || new Date(l.expires_at) > new Date()) &&
      (l.max_uses == null || l.use_count < l.max_uses),
  );

  let code = usable?.code;
  let expiresAt: string | null = usable?.expires_at ?? null;
  let maxUses: number | null = usable?.max_uses ?? null;
  let useCount: number = usable?.use_count ?? 0;
  if (!code) {
    code = generateInviteCode();
    const { data: inserted, error } = await supabase
      .from("invite_links")
      .insert({ group_id: groupId, code, created_by: userId })
      .select("expires_at, max_uses, use_count")
      .single();
    if (error) throw error;
    expiresAt = inserted?.expires_at ?? null;
    maxUses = inserted?.max_uses ?? null;
    useCount = inserted?.use_count ?? 0;
  }
  return {
    url: `${window.location.origin}/invite/${code}`,
    expiresAt,
    maxUses,
    useCount,
  };
}

function formatExpiresAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs <= 0) return "expirado";
  const days = Math.floor(diffMs / 86400000);
  if (days >= 1) return `expira em ${days} dia${days !== 1 ? "s" : ""}`;
  const hours = Math.floor(diffMs / 3600000);
  if (hours >= 1) return `expira em ${hours}h`;
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  return `expira em ${mins} min`;
}

type SortKey = "newest" | "biggest" | "smallest";
type SportFilter = "all" | "padel" | "tennis";
type FormatFilter = "all" | "doubles" | "singles";
type SizeFilter = "all" | "small" | "medium" | "large";

export function ExplorePanel() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [sport, setSport] = useState<SportFilter>("all");
  const [format, setFormat] = useState<FormatFilter>("all");
  const [size, setSize] = useState<SizeFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const { groups, isLoading } = usePublicGroups(search);

  const handleCopyInvite = async (e: React.MouseEvent, groupId: string, canInvite: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    if (!canInvite) {
      toast.error("Você não tem permissão para gerar convites deste grupo.");
      return;
    }
    setCopyingId(groupId);
    try {
      const url = await getOrCreateInviteUrl(groupId, user.id);
      await navigator.clipboard.writeText(url);
      toast.success("Link de convite copiado!");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao gerar link");
    } finally {
      setCopyingId(null);
    }
  };

  const filtered = useMemo(() => {
    let list = groups.slice();
    if (sport !== "all") list = list.filter((g) => g.sport === sport);
    if (format !== "all") list = list.filter((g) => g.match_format === format);
    if (size !== "all") {
      list = list.filter((g) => {
        const c = g.member_count;
        if (size === "small") return c <= 6;
        if (size === "medium") return c > 6 && c <= 15;
        return c > 15;
      });
    }
    if (sort === "biggest") list.sort((a, b) => b.member_count - a.member_count);
    else if (sort === "smallest") list.sort((a, b) => a.member_count - b.member_count);
    // newest is the default order from the API
    return list;
  }, [groups, sport, format, size, sort]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-bold text-foreground">Explorar grupos públicos</h2>
        </div>

        {/* Search + filters toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome..."
              className="w-full rounded-full border border-border bg-background/60 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
              showFilters
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-background/60 text-muted-foreground hover:border-primary/30"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtros
          </button>
        </div>

        {/* Filter chips */}
        {showFilters && (
          <div className="mt-3 space-y-2.5 rounded-xl border border-border/40 bg-background/40 p-3">
            <ChipRow
              label="Esporte"
              value={sport}
              onChange={(v) => setSport(v as SportFilter)}
              options={[
                { value: "all", label: "Todos" },
                { value: "padel", label: "Padel" },
                { value: "tennis", label: "Tênis" },
              ]}
            />
            <ChipRow
              label="Formato"
              value={format}
              onChange={(v) => setFormat(v as FormatFilter)}
              options={[
                { value: "all", label: "Todos" },
                { value: "doubles", label: "Doubles" },
                { value: "singles", label: "Singles" },
              ]}
            />
            <ChipRow
              label="Tamanho"
              value={size}
              onChange={(v) => setSize(v as SizeFilter)}
              options={[
                { value: "all", label: "Todos" },
                { value: "small", label: "Até 6" },
                { value: "medium", label: "7-15" },
                { value: "large", label: "16+" },
              ]}
            />
            <ChipRow
              label="Ordenar"
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={[
                { value: "newest", label: "Mais novos" },
                { value: "biggest", label: "Mais membros" },
                { value: "smallest", label: "Menos membros" },
              ]}
            />
          </div>
        )}
      </div>

      {/* Results */}
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Filter className="mr-1 inline h-3 w-3" />
            {isLoading ? "Buscando..." : `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/30" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
            <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-bold text-foreground">Nada encontrado</p>
            <p className="mt-1 text-xs text-muted-foreground">Tente ajustar os filtros ou a busca.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((g) => {
              const isHiddenAdmin = (g as any).is_hidden_admin === true;
              return (
                <Link
                  key={g.id}
                  to="/groups/$groupId"
                  params={{ groupId: g.id }}
                  className={`group flex items-start gap-3 rounded-2xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-lg active:scale-[0.99] ${
                    isHiddenAdmin ? "border-dashed border-muted-foreground/40" : "border-border"
                  }`}
                >
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                    {g.image_url ? (
                      <img src={g.image_url} alt="" className="h-full w-full rounded-xl object-cover" />
                    ) : (
                      <Users className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-foreground">{g.name}</span>
                      {isHiddenAdmin ? (
                        <EyeOff className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      ) : g.is_public ? (
                        <Globe className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <Lock className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      )}
                      {isHiddenAdmin && (
                        <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                          Oculto
                        </span>
                      )}
                      {g.is_premium && (
                        <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full bg-[var(--rank-gold)]/15 px-1.5 py-0.5 text-[9px] font-bold text-[var(--rank-gold)] ring-1 ring-[var(--rank-gold)]/40">
                          <Crown className="h-2.5 w-2.5" />
                          PREMIUM
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {g.member_count} membro{g.member_count !== 1 ? "s" : ""} ·{" "}
                      {g.match_format === "singles" ? "Singles" : "Doubles"} ·{" "}
                      {g.sport === "tennis" ? "Tênis" : "Padel"}
                    </p>
                    {g.description && (
                      <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground/80">{g.description}</p>
                    )}
                    {isHiddenAdmin && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] text-muted-foreground/80">
                          Só você vê este grupo aqui — compartilhe o convite para novos jogadores entrarem.
                        </p>
                        <button
                          type="button"
                          onClick={(e) => handleCopyInvite(e, g.id, isHiddenAdmin)}
                          disabled={copyingId === g.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                        >
                          {copyingId === g.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          Copiar convite
                        </button>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface ChipOption {
  value: string;
  label: string;
}

function ChipRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ChipOption[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
