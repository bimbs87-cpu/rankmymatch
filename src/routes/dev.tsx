import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Users, Boxes, Trophy, Activity, ShieldCheck, ExternalLink } from "lucide-react";
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

function DevDashboardPage() {
type DashboardPayload = Awaited<ReturnType<typeof getDevDashboard>>;

function DevDashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getDevDashboard()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
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
          <TabsList className="mb-6 grid w-full grid-cols-5 max-w-2xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="signups">Cadastros</TabsTrigger>
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
  const { overview, dailyActivity } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={Users} label="Usuários" value={overview.totalUsers} />
        <StatCard icon={Boxes} label="Grupos" value={overview.totalGroups} />
        <StatCard icon={Trophy} label="Partidas" value={overview.totalMatches} />
        <StatCard icon={Activity} label="DAU" value={overview.dau} hint="últimas 24h" />
        <StatCard icon={Activity} label="WAU" value={overview.wau} hint="últimos 7d" />
        <StatCard icon={Activity} label="MAU" value={overview.mau} hint="últimos 30d" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atividade últimos 30 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => d.slice(5)}
                  className="text-xs"
                />
                <YAxis allowDecimals={false} className="text-xs" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="users"
                  name="Logins (last_sign_in)"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="signups"
                  name="Novos cadastros"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
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
            ⚠️ Aproximação baseada em <code>last_sign_in_at</code>. Para retenção precisa por
            evento, seria necessário um log de sessões.
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
