import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Users, Boxes, Trophy, Activity, ShieldCheck, ExternalLink, Compass, UserPlus, UserCheck, UserX, AlertTriangle, Clock, Sparkles, Eye, MousePointerClick, Globe, Smartphone, TrendingUp, LogIn } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getDevDashboard } from "@/lib/dev-dashboard.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dev")({
  head: () => ({
    meta: [
      { title: "Dev Dashboard — RankMyMatch" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async () => {
    // Skip on SSR — no auth cookies available, would always redirect to /.
    // Auth/admin check happens client-side in the component.
    if (typeof window === "undefined") return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: "/dev" } as never });
    }
    const { data: admin } = await supabase
      .from("app_admins")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!admin) {
      throw redirect({ to: "/" });
    }
  },
  component: DevDashboardPage,
});

type DashboardPayload = Awaited<ReturnType<typeof getDevDashboard>>;

function DevDashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error("Sessão não encontrada");
        const res = await getDevDashboard({
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center">
        <p className="text-destructive">Erro ao carregar dashboard: {String(error)}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">Dev Dashboard</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3" /> Acesso restrito a app_admins
              </p>
            </div>
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex">
            {data.overview.totalUsers} usuários
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6 grid w-full grid-cols-3 sm:grid-cols-6 max-w-3xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="signups">Cadastros</TabsTrigger>
            <TabsTrigger value="acquisition">Aquisição</TabsTrigger>
            <TabsTrigger value="funnel">Funil</TabsTrigger>
            <TabsTrigger value="retention">Retenção</TabsTrigger>
            <TabsTrigger value="changelog">Changelog</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab data={data} />
          </TabsContent>

          <TabsContent value="signups">
            <SignupsTab signups={data.signups} />
          </TabsContent>

          <TabsContent value="acquisition">
            <AcquisitionTab acquisition={data.acquisition} signups={data.signups} />
          </TabsContent>

          <TabsContent value="funnel">
            <FunnelTab funnel={data.funnel} />
          </TabsContent>

          <TabsContent value="retention">
            <RetentionTab cohorts={data.cohorts} />
          </TabsContent>

          <TabsContent value="changelog">
            <ChangelogTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

type DashboardData = Awaited<ReturnType<typeof getDevDashboard>>;

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-3xl font-bold">{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ data }: { data: DashboardData }) {
  const { overview, dailyActivity, recentActivity, diagnostics, traffic } = data;
  const conversionToGroup =
    overview.totalUsers > 0
      ? ((overview.usersWithGroup / overview.totalUsers) * 100).toFixed(0)
      : "0";
  const conversionToMatch =
    overview.totalUsers > 0
      ? ((overview.usersWithMatch / overview.totalUsers) * 100).toFixed(0)
      : "0";
  const returnRate =
    overview.totalUsers > 0
      ? ((overview.returningLast7d / overview.totalUsers) * 100).toFixed(0)
      : "0";
  const ghostRate =
    overview.totalUsers > 0
      ? ((overview.neverReturned / overview.totalUsers) * 100).toFixed(0)
      : "0";

  const hasAnomalies =
    overview.authWithoutProfile > 0 || overview.profilesWithoutAuth > 0;

  return (
    <div className="space-y-6">
      {hasAnomalies && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Anomalias detectadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {overview.authWithoutProfile > 0 && (
              <div>
                <strong className="text-destructive">
                  {overview.authWithoutProfile} cadastro(s) sem profile.
                </strong>{" "}
                <span className="text-muted-foreground">
                  Usuário criou conta mas o trigger de criação de perfil falhou.
                </span>
                {diagnostics?.authWithoutProfile.length > 0 && (
                  <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground">
                    {diagnostics.authWithoutProfile.slice(0, 5).map((u) => (
                      <li key={u.user_id}>
                        {u.email ?? u.user_id} —{" "}
                        {new Date(u.created_at).toLocaleString("pt-BR")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {overview.profilesWithoutAuth > 0 && (
              <div>
                <strong>{overview.profilesWithoutAuth} profile(s)</strong>{" "}
                <span className="text-muted-foreground">
                  sem auth.user (placeholders criados por admins — esperado).
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Base de usuários
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Users} label="Cadastros (auth)" value={overview.totalUsers} hint="contas criadas" />
          <StatCard icon={UserCheck} label="Profiles reais" value={overview.realProfiles} hint="com perfil ativo" />
          <StatCard icon={UserX} label="Placeholders" value={overview.placeholderProfiles} hint="criados por admin" />
          <StatCard icon={Boxes} label="Grupos" value={overview.totalGroups} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Novos cadastros
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={UserPlus} label="Hoje" value={overview.signupsToday} />
          <StatCard icon={UserPlus} label="Últimos 7d" value={overview.signupsLast7d} />
          <StatCard icon={UserPlus} label="Últimos 30d" value={overview.signupsLast30d} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Engajamento
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard icon={Activity} label="DAU" value={overview.dau} hint="ativos 24h" />
          <StatCard icon={Activity} label="WAU" value={overview.wau} hint="ativos 7d" />
          <StatCard icon={Activity} label="MAU" value={overview.mau} hint="ativos 30d" />
          <StatCard icon={Sparkles} label="Retornantes 7d" value={overview.returningLast7d} hint={`${returnRate}% da base`} />
          <StatCard icon={Clock} label="Nunca voltaram" value={overview.neverReturned} hint={`${ghostRate}% da base`} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Ativação
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard icon={Trophy} label="Partidas registradas" value={overview.totalMatches} />
          <StatCard icon={Boxes} label="Criaram grupo" value={overview.usersWithGroup} hint={`${conversionToGroup}% dos cadastros`} />
          <StatCard icon={Trophy} label="Jogaram partida" value={overview.usersWithMatch} hint={`${conversionToMatch}% dos cadastros`} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atividade últimos 30 dias</CardTitle>
          <p className="text-xs text-muted-foreground">
            Logins = quem voltou ao app · Cadastros = novos usuários por dia
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} className="text-xs" />
                <YAxis allowDecimals={false} className="text-xs" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="users" name="Logins (last_sign_in)" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="signups" name="Novos cadastros" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos 15 cadastros</CardTitle>
          <p className="text-xs text-muted-foreground">
            Quem chegou recentemente, de onde veio e o que já fez no app.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Cadastrou</TableHead>
                  <TableHead>Voltou?</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.map((s) => {
                  const created = new Date(s.created_at).getTime();
                  const lastSign = s.last_sign_in_at ? new Date(s.last_sign_in_at).getTime() : 0;
                  const returned = lastSign && lastSign - created > 60_000;
                  const daysSince = Math.floor((Date.now() - created) / (24 * 3600_000));
                  return (
                    <TableRow key={s.user_id}>
                      <TableCell>
                        <div className="font-medium text-sm">{s.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{s.email ?? "sem email"}</div>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {daysSince === 0 ? "hoje" : daysSince === 1 ? "ontem" : `há ${daysSince}d`}
                      </TableCell>
                      <TableCell className="text-xs">
                        {returned ? (
                          <span className="text-primary font-medium">Sim</span>
                        ) : (
                          <span className="text-muted-foreground">Nunca</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.origin === "invite" ? "default" : s.origin === "direct" ? "secondary" : "outline"}>
                          {s.origin}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {!s.has_profile && <Badge variant="destructive" className="text-[10px]">sem perfil</Badge>}
                          {s.groups_created > 0 && <Badge variant="outline" className="text-[10px]">{s.groups_created}g</Badge>}
                          {s.has_match && <Badge variant="outline" className="text-[10px]">jogou</Badge>}
                          {s.has_profile && s.groups_created === 0 && !s.has_match && (
                            <span className="text-muted-foreground">só cadastrou</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {recentActivity.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum cadastro recente
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SignupsTab({ signups }: { signups: DashboardData["signups"] }) {
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<"all" | "invite" | "direct" | "unknown">(
    "all"
  );

  const filtered = useMemo(() => {
    return signups.filter((s) => {
      if (originFilter !== "all" && s.origin !== originFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.email?.toLowerCase().includes(q) ||
        s.name?.toLowerCase().includes(q) ||
        s.first_group_name?.toLowerCase().includes(q)
      );
    });
  }, [signups, search, originFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por email, nome ou grupo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-1">
          {(["all", "invite", "direct", "unknown"] as const).map((o) => (
            <Button
              key={o}
              size="sm"
              variant={originFilter === o ? "default" : "outline"}
              onClick={() => setOriginFilter(o)}
            >
              {o === "all" ? "Todos" : o}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} de {signups.length}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead>Último login</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Grupo criado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.user_id}>
                    <TableCell>
                      <div className="font-medium">{s.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{s.email ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(s.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {s.last_sign_in_at
                        ? new Date(s.last_sign_in_at).toLocaleString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.origin === "invite"
                            ? "default"
                            : s.origin === "direct"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {s.origin}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {s.first_group_name ? (
                        <div>
                          <div className="font-medium text-sm">{s.first_group_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.first_group_sport} · {s.first_group_members} membros
                            {s.groups_created > 1 && ` · +${s.groups_created - 1}`}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum cadastro encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelTab({ funnel }: { funnel: DashboardData["funnel"] }) {
  const steps = [
    { label: "Cadastrou", count: funnel.signed_up, color: "bg-primary" },
    { label: "Criou grupo", count: funnel.created_group, color: "bg-accent" },
    { label: "Registrou partida", count: funnel.registered_match, color: "bg-secondary" },
  ];
  const max = funnel.signed_up || 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funil de ativação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {steps.map((step, idx) => {
            const pct = (step.count / max) * 100;
            const conv =
              idx === 0
                ? 100
                : steps[0].count > 0
                  ? (step.count / steps[0].count) * 100
                  : 0;
            const stepConv =
              idx === 0
                ? null
                : steps[idx - 1].count > 0
                  ? (step.count / steps[idx - 1].count) * 100
                  : 0;
            return (
              <div key={step.label}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.label}</span>
                    <span className="text-sm text-muted-foreground">
                      {step.count} ({conv.toFixed(1)}%)
                    </span>
                  </div>
                  {stepConv !== null && (
                    <span className="text-xs text-muted-foreground">
                      etapa: {stepConv.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="h-8 w-full rounded-md bg-muted overflow-hidden">
                  <div
                    className={`h-full ${step.color} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function RetentionTab({ cohorts }: { cohorts: DashboardData["cohorts"] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Retenção por cohort semanal</CardTitle>
          <p className="text-xs text-muted-foreground">
            Baseado em <code>user_sessions</code> (log diário). Para usuários antigos sem sessões
            registradas, faz fallback para <code>last_sign_in_at</code>.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead className="text-right">Cohort</TableHead>
                  <TableHead className="text-right">D1</TableHead>
                  <TableHead className="text-right">D7</TableHead>
                  <TableHead className="text-right">D30</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.map((c) => {
                  const pct = (n: number) =>
                    c.size > 0 ? `${((n / c.size) * 100).toFixed(0)}%` : "—";
                  return (
                    <TableRow key={c.week}>
                      <TableCell className="font-mono text-xs">{c.week}</TableCell>
                      <TableCell className="text-right">{c.size}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium">{c.d1}</span>{" "}
                        <span className="text-xs text-muted-foreground">{pct(c.d1)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium">{c.d7}</span>{" "}
                        <span className="text-xs text-muted-foreground">{pct(c.d7)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium">{c.d30}</span>{" "}
                        <span className="text-xs text-muted-foreground">{pct(c.d30)}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {cohorts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      Sem dados de cohort
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AcquisitionTab({
  acquisition,
  signups,
}: {
  acquisition: DashboardData["acquisition"];
  signups: DashboardData["signups"];
}) {
  const totalSignups = signups.length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Compass} label="Atribuídos" value={acquisition.tracked} hint={`${totalSignups} no total`} />
        <StatCard icon={Compass} label="Sem tracking" value={acquisition.untracked} hint="usuários antigos" />
        <StatCard icon={Compass} label="Via invite" value={acquisition.channels.find((c) => c.key === "invite")?.count ?? 0} />
        <StatCard icon={Compass} label="Direct" value={acquisition.channels.find((c) => c.key === "direct")?.count ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Canais</CardTitle>
            <p className="text-xs text-muted-foreground">
              invite = via convite · utm:* = de campanha · referrer = veio de outro site · direct
              = sem origem · untracked = cadastrou antes do tracking
            </p>
          </CardHeader>
          <CardContent>
            <BreakdownList items={acquisition.channels} total={totalSignups} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">UTM Source</CardTitle>
          </CardHeader>
          <CardContent>
            {acquisition.utmSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum UTM capturado ainda.</p>
            ) : (
              <BreakdownList items={acquisition.utmSources} total={acquisition.tracked} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campanhas</CardTitle>
          </CardHeader>
          <CardContent>
            {acquisition.utmCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma campanha capturada ainda.</p>
            ) : (
              <BreakdownList items={acquisition.utmCampaigns} total={acquisition.tracked} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Referrers</CardTitle>
          </CardHeader>
          <CardContent>
            {acquisition.referrers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum referrer capturado ainda.</p>
            ) : (
              <BreakdownList items={acquisition.referrers} total={acquisition.tracked} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BreakdownList({
  items,
  total,
}: {
  items: { key: string; count: number }[];
  total: number;
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const pct = total > 0 ? (item.count / total) * 100 : 0;
        const barPct = (item.count / max) * 100;
        return (
          <div key={item.key}>
            <div className="flex items-baseline justify-between text-sm mb-1">
              <span className="font-medium truncate">{item.key}</span>
              <span className="text-muted-foreground text-xs ml-2 whitespace-nowrap">
                {item.count} · {pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 w-full rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${barPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChangelogTab() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Gerenciar Changelog <ExternalLink className="h-4 w-4" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Adicione, edite e publique notas de versão.
          </p>
          <Link to="/sobre-desenvolvimento/changelog-admin">
            <Button>Abrir admin de changelog</Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Triagem de bugs <ExternalLink className="h-4 w-4" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Bugs reportados pelos usuários, com prioridade e status.
          </p>
          <Link to="/sobre-desenvolvimento/admin">
            <Button variant="outline">Abrir triagem</Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Inbox admin <ExternalLink className="h-4 w-4" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Solicitações pendentes em todos os grupos.
          </p>
          <Link to="/admin/inbox">
            <Button variant="outline">Abrir inbox</Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Métricas técnicas <ExternalLink className="h-4 w-4" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            OG cache, push diagnostics e auditoria.
          </p>
          <Link to="/admin/metrics">
            <Button variant="outline">Abrir métricas</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
