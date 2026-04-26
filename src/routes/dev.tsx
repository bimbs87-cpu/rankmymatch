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
import { sendMonthlyReportNow } from "@/lib/monthly-report.functions";
import { FunnelSankeyCard, type SankeyData } from "@/components/dev/FunnelSankeyCard";
import { TopDropSegmentsCard, type DropSegmentRow } from "@/components/dev/TopDropSegmentsCard";
import { FictionalGroupsTab } from "@/components/dev/FictionalGroupsTab";
import { toast } from "sonner";
import { FileText, Send } from "lucide-react";
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
          <TabsList className="mb-6 grid w-full grid-cols-3 sm:grid-cols-7 max-w-4xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="signups">Cadastros</TabsTrigger>
            <TabsTrigger value="acquisition">Aquisição</TabsTrigger>
            <TabsTrigger value="funnel">Funil</TabsTrigger>
            <TabsTrigger value="retention">Retenção</TabsTrigger>
            <TabsTrigger value="fictional">Fictícios</TabsTrigger>
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

          <TabsContent value="fictional">
            <FictionalGroupsTab />
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

type SegmentRow = {
  key: string;
  sessions: number;
  signups: number;
  groups: number;
  matches: number;
  signupRate: number;
  groupRate: number;
  matchRate: number;
};

type SegmentFunnelData = {
  overall: { sessions: number; signups: number; groups: number; matches: number };
  utm: SegmentRow[];
  referrer: SegmentRow[];
};

type MomPeriod = {
  sessions: number;
  pageviews: number;
  signups: number;
  bounceRate: number;
};
type MomWindow = {
  current: MomPeriod;
  previous: MomPeriod;
  delta: { sessions: number; pageviews: number; signups: number; bounceRate: number };
};
type MomData = {
  window7d: MomWindow;
  window30d: MomWindow;
};

type AnomalySample = { user_id: string; email: string | null; created_at: string | null };
type SignupAnomaliesData = {
  ghostUsers: { count: number; sample: AnomalySample[] };
  signupWithoutOnbEvent: { count: number; sample: AnomalySample[] };
  authedSessionWithoutSignupEvent: { count: number; sample: AnomalySample[] };
  loginAbandon: {
    sessionsTouchedLogin: number;
    abandoned: number;
    converted: number;
    abandonRate: number;
  };
};

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

function MomComparisonCard({ mom }: { mom: MomData }) {
  const fmtPct = (n: number) => (n > 0 ? `+${n}%` : `${n}%`);
  const fmtDelta = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const colorFor = (n: number, invert = false) => {
    const positive = invert ? n < 0 : n > 0;
    const negative = invert ? n > 0 : n < 0;
    if (positive) return "text-emerald-500";
    if (negative) return "text-destructive";
    return "text-muted-foreground";
  };
  const renderWindow = (label: string, w: MomWindow) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: "Sessões", cur: w.current.sessions, prev: w.previous.sessions, d: w.delta.sessions, fmt: fmtPct, invert: false },
          { k: "Pageviews", cur: w.current.pageviews, prev: w.previous.pageviews, d: w.delta.pageviews, fmt: fmtPct, invert: false },
          { k: "Cadastros", cur: w.current.signups, prev: w.previous.signups, d: w.delta.signups, fmt: fmtPct, invert: false },
          { k: "Bounce", cur: `${w.current.bounceRate}%`, prev: `${w.previous.bounceRate}%`, d: w.delta.bounceRate, fmt: (n: number) => `${fmtDelta(n)}pp`, invert: true },
        ].map((row) => (
          <div key={row.k} className="rounded-lg border border-border bg-card/50 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{row.k}</p>
            <p className="font-display text-xl font-bold mt-0.5">{row.cur}</p>
            <p className="text-[10px] text-muted-foreground">vs {row.prev}</p>
            <p className={`text-xs font-semibold mt-1 ${colorFor(row.d, row.invert)}`}>
              {row.fmt(row.d)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Comparação período-contra-período
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Atual vs período anterior equivalente. Bounce em verde = caiu (bom).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderWindow("Últimos 7 dias vs 7 dias anteriores", mom.window7d)}
        {renderWindow("Últimos 30 dias vs 30 dias anteriores", mom.window30d)}
      </CardContent>
    </Card>
  );
}

function AnomalyRow({
  severity,
  count,
  label,
  explanation,
  sample,
}: {
  severity: "high" | "medium" | "low";
  count: number;
  label: string;
  explanation: string;
  sample: AnomalySample[];
}) {
  const sevColor =
    severity === "high"
      ? "text-destructive"
      : severity === "medium"
        ? "text-amber-500"
        : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <strong className={sevColor}>
          {count} — {label}
        </strong>
        <Badge variant="outline" className="text-[10px] uppercase">{severity}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{explanation}</p>
      {sample.length > 0 && (
        <ul className="mt-2 ml-4 list-disc text-xs text-muted-foreground space-y-0.5">
          {sample.slice(0, 5).map((u) => (
            <li key={u.user_id}>
              {u.email ?? u.user_id}
              {u.created_at && (
                <> — {new Date(u.created_at).toLocaleString("pt-BR")}</>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OverviewTab({ data }: { data: DashboardData }) {
  const { overview, dailyActivity, recentActivity, diagnostics, traffic } = data;
  const onboardingFunnel = (data as unknown as { onboardingFunnel?: { key: string; label: string; users: number }[] }).onboardingFunnel ?? [];
  const segmentFunnel7d = (data as unknown as { segmentFunnel7d?: SegmentFunnelData }).segmentFunnel7d;
  const segmentFunnel30d = (data as unknown as { segmentFunnel30d?: SegmentFunnelData }).segmentFunnel30d;
  const sankeyUtm7d = (data as unknown as { sankeyUtm7d?: SankeyData }).sankeyUtm7d;
  const sankeyReferrer7d = (data as unknown as { sankeyReferrer7d?: SankeyData }).sankeyReferrer7d;
  const topDropSegments = (data as unknown as { topDropSegments?: DropSegmentRow[] }).topDropSegments ?? [];
  const mom = (data as unknown as { mom?: MomData }).mom;
  const signupAnomalies = (data as unknown as { signupAnomalies?: SignupAnomaliesData }).signupAnomalies;
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

  const totalAnomalies =
    (signupAnomalies?.ghostUsers.count ?? 0) +
    (signupAnomalies?.signupWithoutOnbEvent.count ?? 0) +
    (signupAnomalies?.authedSessionWithoutSignupEvent.count ?? 0);
  const hasAnomalies =
    overview.authWithoutProfile > 0 ||
    overview.profilesWithoutAuth > 0 ||
    totalAnomalies > 0 ||
    (signupAnomalies?.loginAbandon.abandoned ?? 0) > 0;

  return (
    <div className="space-y-6">
      <MonthlyReportCard />

      {/* === Comparação Mês-contra-Mês (MoM) === */}
      {mom && <MomComparisonCard mom={mom} />}

      {hasAnomalies && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Anomalias detectadas no signup
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Diagnóstico de por que usuários podem não estar convertendo mesmo com tráfego alto.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* 1. Ghost users (auth sem profile) */}
            {(signupAnomalies?.ghostUsers.count ?? 0) > 0 && (
              <AnomalyRow
                severity="high"
                count={signupAnomalies!.ghostUsers.count}
                label="Ghost users (auth sem profile)"
                explanation="Usuário criou conta mas o trigger que cria o profile falhou — provavelmente não consegue usar o app."
                sample={signupAnomalies!.ghostUsers.sample}
              />
            )}

            {/* 2. Signup sem evento de tracking */}
            {(signupAnomalies?.signupWithoutOnbEvent.count ?? 0) > 0 && (
              <AnomalyRow
                severity="medium"
                count={signupAnomalies!.signupWithoutOnbEvent.count}
                label="Signup sem evento 'signup' (instrumentação falhou)"
                explanation="Usuário cadastrou nos últimos 30d mas o evento onboarding 'signup' não foi registrado. Pode quebrar métricas de funil."
                sample={signupAnomalies!.signupWithoutOnbEvent.sample}
              />
            )}

            {/* 3. Sessão autenticada sem evento signup */}
            {(signupAnomalies?.authedSessionWithoutSignupEvent.count ?? 0) > 0 && (
              <AnomalyRow
                severity="low"
                count={signupAnomalies!.authedSessionWithoutSignupEvent.count}
                label="Sessão autenticada sem evento 'signup'"
                explanation="Sessão tem user_id mas o usuário nunca disparou o evento 'signup' (cadastros antigos antes da instrumentação ou regressão)."
                sample={signupAnomalies!.authedSessionWithoutSignupEvent.sample}
              />
            )}

            {/* 4. Abandono em /login */}
            {signupAnomalies && signupAnomalies.loginAbandon.sessionsTouchedLogin > 0 && (
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <strong className="text-destructive">
                    Abandono em /login: {signupAnomalies.loginAbandon.abandonRate}%
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    {signupAnomalies.loginAbandon.abandoned} abandonaram ·{" "}
                    {signupAnomalies.loginAbandon.converted} converteram ·{" "}
                    {signupAnomalies.loginAbandon.sessionsTouchedLogin} sessões tocaram /login
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Sessões que chegaram em /login mas o usuário nunca completou o cadastro. Alta taxa pode indicar fricção no Google OAuth ou problema na tela.
                </p>
              </div>
            )}

            {/* Legacy compat: cadastros sem profile (já coberto por ghost users — mantido por segurança) */}
            {overview.authWithoutProfile > 0 && (signupAnomalies?.ghostUsers.count ?? 0) === 0 && (
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
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">{overview.profilesWithoutAuth} profile(s)</strong>{" "}
                sem auth.user (placeholders criados por admins — esperado, não é bug).
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* === TRÁFEGO DO SITE (todos os visitantes, inclusive anônimos) === */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Tráfego do site (visitantes anônimos + logados)
          </h2>
          {!traffic?.hasData && (
            <Badge variant="outline" className="text-[10px]">
              Aguardando dados — comece a aparecer após o próximo deploy
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={Eye}
            label="Pageviews hoje"
            value={traffic?.pageviewsToday ?? 0}
            hint={`${traffic?.pageviews7d ?? 0} em 7d`}
          />
          <StatCard
            icon={Users}
            label="Sessões hoje"
            value={traffic?.sessionsToday ?? 0}
            hint={`${traffic?.sessions7d ?? 0} em 7d · visitantes únicos`}
          />
          <StatCard
            icon={Sparkles}
            label="Novos visitantes hoje"
            value={traffic?.firstVisitsToday ?? 0}
            hint={`${traffic?.firstVisits7d ?? 0} em 7d`}
          />
          <StatCard
            icon={MousePointerClick}
            label="Conversão visitor→signup"
            value={`${traffic?.visitorToSignupRate7d ?? 0}%`}
            hint={`${traffic?.sessionsConverted7d ?? 0} de ${traffic?.sessions7d ?? 0} sessões 7d`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-3">
          <StatCard
            icon={LogIn}
            label="Bounce rate 7d"
            value={`${traffic?.bounceRate7d ?? 0}%`}
            hint="sessão com 1 só pageview"
          />
          <StatCard
            icon={TrendingUp}
            label="Páginas / sessão"
            value={traffic?.pagesPerSession7d ?? 0}
            hint="média 7d"
          />
          <StatCard
            icon={UserX}
            label="Sessões anônimas 7d"
            value={traffic?.anonSessions7d ?? 0}
            hint="nunca logaram"
          />
          <StatCard
            icon={UserCheck}
            label="Sessões logadas 7d"
            value={traffic?.authSessions7d ?? 0}
          />
        </div>
      </div>

      {/* === FUNIL END-TO-END (visitor → signup → group → match) === */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funil end-to-end (últimos 7 dias)</CardTitle>
          <p className="text-xs text-muted-foreground">
            De visitante anônimo até jogador ativo. Cada etapa mostra a queda real.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Visitaram o site (sessões 7d)", value: traffic?.sessions7d ?? 0 },
            { label: "Cadastraram (7d)", value: overview.signupsLast7d },
            { label: "Criaram grupo (acumulado)", value: overview.usersWithGroup },
            { label: "Jogaram partida (acumulado)", value: overview.usersWithMatch },
          ].map((step, i, arr) => {
            const base = arr[0].value || 1;
            const pct = (step.value / base) * 100;
            const dropFromPrev = i > 0 ? arr[i - 1].value - step.value : 0;
            return (
              <div key={step.label}>
                <div className="flex items-baseline justify-between text-sm mb-1">
                  <span className="font-medium">{step.label}</span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {step.value} · {pct.toFixed(1)}%
                    {i > 0 && dropFromPrev > 0 && (
                      <span className="text-destructive ml-2">−{dropFromPrev}</span>
                    )}
                  </span>
                </div>
                <div className="h-3 w-full rounded bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* === Drill-down end-to-end por canal de aquisição (ads) === */}
      {(segmentFunnel7d || segmentFunnel30d) && (
        <SegmentFunnelCard
          data7d={segmentFunnel7d}
          data30d={segmentFunnel30d}
        />
      )}

      {/* === Sankey: visualização do funil por origem === */}
      <FunnelSankeyCard utm={sankeyUtm7d} referrer={sankeyReferrer7d} />

      {/* === Top 10 segmentos com maior queda === */}
      <TopDropSegmentsCard rows={topDropSegments} />

      {/* Aquisição por canal (sessões, não cadastros) */}
      {traffic?.hasData && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4" /> Origem das sessões 30d
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                De onde vêm as pessoas que visitam (não só as cadastradas).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">UTM Source</p>
                {traffic.topUtmSources.length > 0 ? <BreakdownList items={traffic.topUtmSources} total={traffic.sessions7d || 1} /> : <p className="text-xs text-muted-foreground">Nenhum tráfego com UTM</p>}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Referrers</p>
                {traffic.topReferrers.length > 0 ? <BreakdownList items={traffic.topReferrers} total={traffic.sessions7d || 1} /> : <p className="text-xs text-muted-foreground">Tráfego direto</p>}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">UTM Campaign</p>
                {traffic.topCampaigns.length > 0 ? <BreakdownList items={traffic.topCampaigns} total={traffic.sessions7d || 1} /> : <p className="text-xs text-muted-foreground">—</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Comportamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Landing pages (1ª visita)</p>
                {traffic.topLandingPages.length > 0 ? <BreakdownList items={traffic.topLandingPages} total={traffic.sessions7d || 1} /> : <p className="text-xs text-muted-foreground">—</p>}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Páginas mais vistas 7d</p>
                {traffic.topPages7d.length > 0 ? <BreakdownList items={traffic.topPages7d} total={traffic.pageviews7d || 1} /> : <p className="text-xs text-muted-foreground">—</p>}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Dispositivos</p>
                {traffic.devices.length > 0 ? <BreakdownList items={traffic.devices} total={traffic.sessions7d || 1} /> : <p className="text-xs text-muted-foreground">—</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gráfico de tráfego diário */}
      {traffic?.hasData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tráfego diário (30d)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Sessões = visitantes únicos · Pageviews = total · Novos = primeira visita ever
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={traffic.trafficDaily}>
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
                  <Line type="monotone" dataKey="sessions" name="Sessões" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="pageviews" name="Pageviews" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="newVisitors" name="Novos visitantes" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* === Conversão por canal (UTM/Referrer) — 7d === */}
      {traffic?.hasData && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversão por UTM source (7d)</CardTitle>
              <p className="text-xs text-muted-foreground">
                Sessões que viraram cadastro, agrupado por origem de campanha.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <ConversionTable rows={traffic.utmConversion7d ?? []} colLabel="UTM source" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversão por referrer (7d)</CardTitle>
              <p className="text-xs text-muted-foreground">
                De onde vieram (domínio externo) e quanto converteu.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <ConversionTable rows={traffic.referrerConversion7d ?? []} colLabel="Referrer" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* === Bounce rate por landing page === */}
      {traffic?.hasData && (traffic.landingBounce7d?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Páginas que mais perdem visitantes (7d)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Landings com sessões de 1 só pageview — onde o ads pode estar mandando tráfego ruim.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Página</TableHead>
                    <TableHead className="text-right">Sessões</TableHead>
                    <TableHead className="text-right">Bounced</TableHead>
                    <TableHead className="text-right">Bounce rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(traffic.landingBounce7d ?? []).slice(0, 12).map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-mono text-xs truncate max-w-[260px]">{r.key}</TableCell>
                      <TableCell className="text-right">{r.sessions}</TableCell>
                      <TableCell className="text-right">{r.bounced}</TableCell>
                      <TableCell className="text-right">
                        <span className={r.bounceRate >= 70 ? "text-destructive font-semibold" : r.bounceRate >= 50 ? "text-amber-500 font-medium" : "text-foreground"}>
                          {r.bounceRate}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* === Funil de onboarding pós-signup === */}
      {onboardingFunnel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funil de onboarding (30d)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Etapas após o signup. A queda entre etapas mostra onde os usuários travam.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {onboardingFunnel.map((step, i, arr) => {
              const base = arr[0].users || 1;
              const pct = (step.users / base) * 100;
              const drop = i > 0 ? arr[i - 1].users - step.users : 0;
              return (
                <div key={step.key}>
                  <div className="flex items-baseline justify-between text-sm mb-1">
                    <span className="font-medium">{step.label}</span>
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      {step.users} · {pct.toFixed(1)}%
                      {i > 0 && drop > 0 && (
                        <span className="text-destructive ml-2">−{drop}</span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 w-full rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground pt-1">
              Eventos começam a ser registrados a partir desta versão — usuários antigos não aparecem em todas as etapas.
            </p>
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

function SegmentFunnelCard({
  data7d,
  data30d,
}: {
  data7d?: SegmentFunnelData;
  data30d?: SegmentFunnelData;
}) {
  const [window, setWindow] = useState<"7d" | "30d">("7d");
  const [dim, setDim] = useState<"utm" | "referrer">("utm");
  const [filter, setFilter] = useState<string | null>(null);

  const active = window === "7d" ? data7d : data30d;
  if (!active) return null;

  const rows = (dim === "utm" ? active.utm : active.referrer) ?? [];
  const filteredRow = filter ? rows.find((r) => r.key === filter) : null;

  // Soma agregada (do segmento selecionado ou overall)
  const summary = filteredRow
    ? {
        sessions: filteredRow.sessions,
        signups: filteredRow.signups,
        groups: filteredRow.groups,
        matches: filteredRow.matches,
      }
    : active.overall;

  const steps = [
    { label: "Sessões", value: summary.sessions },
    { label: "Cadastraram", value: summary.signups },
    { label: "Criaram/entraram em grupo", value: summary.groups },
    { label: "Jogaram partida", value: summary.matches },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Drill-down do funil por canal (ads & referrers)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Veja como cada canal de aquisição converte de visitante até jogador. Clique numa linha para filtrar o funil.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <div className="flex gap-1">
            {(["7d", "30d"] as const).map((w) => (
              <Button
                key={w}
                size="sm"
                variant={window === w ? "default" : "outline"}
                onClick={() => {
                  setWindow(w);
                  setFilter(null);
                }}
              >
                {w}
              </Button>
            ))}
          </div>
          <div className="flex gap-1">
            {(["utm", "referrer"] as const).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={dim === d ? "default" : "outline"}
                onClick={() => {
                  setDim(d);
                  setFilter(null);
                }}
              >
                {d === "utm" ? "Por UTM source" : "Por referrer"}
              </Button>
            ))}
          </div>
          {filter && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFilter(null)}
              className="text-xs"
            >
              Limpar filtro: {filter} ✕
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Funil agregado/filtrado */}
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            {filter
              ? `Funil de ${dim === "utm" ? "UTM source" : "referrer"} = ${filter} (${window})`
              : `Funil agregado (${window})`}
          </div>
          {steps.map((s, i, arr) => {
            const base = arr[0].value || 1;
            const pct = (s.value / base) * 100;
            const stepConv =
              i > 0 && arr[i - 1].value > 0
                ? (s.value / arr[i - 1].value) * 100
                : null;
            const drop = i > 0 ? arr[i - 1].value - s.value : 0;
            return (
              <div key={s.label}>
                <div className="flex items-baseline justify-between text-sm mb-1">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {s.value} · {pct.toFixed(1)}% do topo
                    {stepConv !== null && (
                      <span className="ml-2">→ {stepConv.toFixed(1)}% etapa</span>
                    )}
                    {i > 0 && drop > 0 && (
                      <span className="text-destructive ml-2">−{drop}</span>
                    )}
                  </span>
                </div>
                <div className="h-3 w-full rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Tabela detalhada por segmento */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dim === "utm" ? "UTM source" : "Referrer"}</TableHead>
                <TableHead className="text-right">Sessões</TableHead>
                <TableHead className="text-right">→ Signup</TableHead>
                <TableHead className="text-right">→ Grupo</TableHead>
                <TableHead className="text-right">→ Partida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-xs">
                    Sem dados suficientes para esta janela.
                  </TableCell>
                </TableRow>
              )}
              {rows.slice(0, 15).map((r) => {
                const selected = filter === r.key;
                return (
                  <TableRow
                    key={r.key}
                    className={`cursor-pointer hover:bg-muted/40 ${selected ? "bg-primary/10" : ""}`}
                    onClick={() => setFilter(selected ? null : r.key)}
                  >
                    <TableCell className="font-mono text-xs truncate max-w-[160px]">
                      {r.key}
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.sessions}</TableCell>
                    <TableCell className="text-right text-xs">
                      <span className="font-medium">{r.signups}</span>{" "}
                      <span className={r.signupRate >= 5 ? "text-primary" : "text-muted-foreground"}>
                        ({r.signupRate}%)
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {r.groups}{" "}
                      <span className="text-muted-foreground">({r.groupRate}%)</span>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {r.matches}{" "}
                      <span className="text-muted-foreground">({r.matchRate}%)</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Atribuição: first-touch da sessão. % entre parênteses é a taxa relativa à etapa anterior. Grupo/Partida são acumulados (usuário pode ter feito após a sessão).
        </p>
      </CardContent>
    </Card>
  );
}

function ConversionTable({
  rows,
  colLabel,
}: {
  rows: { key: string; sessions: number; converted: number; rate: number }[];
  colLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground p-4">Sem dados suficientes (mínimo 2 sessões por canal).</p>;
  }
  const sorted = [...rows].sort((a, b) => b.rate - a.rate);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{colLabel}</TableHead>
            <TableHead className="text-right">Sessões</TableHead>
            <TableHead className="text-right">Cadastros</TableHead>
            <TableHead className="text-right">Taxa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.slice(0, 12).map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-mono text-xs truncate max-w-[200px]">{r.key}</TableCell>
              <TableCell className="text-right">{r.sessions}</TableCell>
              <TableCell className="text-right">{r.converted}</TableCell>
              <TableCell className="text-right">
                <span className={r.rate >= 5 ? "text-primary font-semibold" : r.rate > 0 ? "text-foreground" : "text-muted-foreground"}>
                  {r.rate}%
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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

function MonthlyReportCard() {
  const [loading, setLoading] = useState<"current" | "previous" | null>(null);
  const [result, setResult] = useState<{
    periodLabel: string;
    downloadUrl: string;
    recipients: string[];
  } | null>(null);

  const trigger = async (month: "current" | "previous") => {
    setLoading(month);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão não encontrada");
      const res = await sendMonthlyReportNow({
        data: { month },
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      setResult({
        periodLabel: res.periodLabel,
        downloadUrl: res.downloadUrl,
        recipients: res.recipients,
      });
      toast.success(
        `Relatório de ${res.periodLabel} enviado para ${res.recipients.length} destinatário(s).`
      );
    } catch (err) {
      console.error("[monthly-report] failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Falha ao gerar relatório"
      );
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Relatório mensal em PDF
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gera um PDF com tráfego do mês, janelas de 7d/30d e top UTMs/referrers.
          Enviado automaticamente todo dia 1 para{" "}
          <code className="text-xs">guilherme@wernerwalter.com.br</code> e{" "}
          <code className="text-xs">bimbs87@gmail.com</code>. Use os botões
          abaixo para enviar agora.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => trigger("previous")}
            disabled={loading !== null}
          >
            {loading === "previous" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar relatório do mês anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => trigger("current")}
            disabled={loading !== null}
          >
            {loading === "current" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar prévia do mês atual
          </Button>
        </div>
        {result && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div>
              <strong>Período:</strong> {result.periodLabel}
            </div>
            <div>
              <strong>Destinatários:</strong> {result.recipients.join(", ")}
            </div>
            <div>
              <a
                href={result.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Baixar PDF gerado
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
