import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { Button } from "@/components/ui/button";
import { Zap, Users, BarChart3, Trophy, Download, Sparkles, Calendar, TrendingUp } from "lucide-react";
import logoHorizontalDark from "@/assets/logo-horizontal-dark.png";
import logoHorizontalLight from "@/assets/logo-horizontal-light.png";
import logoSquareNeon from "@/assets/logo-square-neon.png";
import { useTheme } from "@/lib/theme";
import { useInstallFlow } from "@/components/InstallFlowProvider";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — RankMyMatch" },
      { name: "description", content: "Acesse sua conta no RankMyMatch e gerencie seus rankings, temporadas e grupos." },
      { property: "og:title", content: "Entrar no RankMyMatch" },
      { property: "og:description", content: "Login com Google em segundos." },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://rankmymatch.app/login" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { resolved: resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { canInstall, isFlowActive, startInstall, isInstalled } = useInstallFlow();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [isAuthenticated, authLoading, navigate]);

  if (authLoading) {
    return <TrophyLoadingBar />;
  }

  if (isAuthenticated) {
    return null;
  }

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      // iOS Safari has known issues persisting Supabase sessions when
      // localStorage is in a transient state right after an OAuth callback.
      // Verify localStorage is usable before initiating the flow.
      try {
        const testKey = "__rmm_ls_test__";
        window.localStorage.setItem(testKey, "1");
        window.localStorage.removeItem(testKey);
      } catch {
        setError(
          "Seu navegador está bloqueando o armazenamento local (talvez Modo Privado do Safari). " +
          "Abra em uma aba normal para entrar."
        );
        setLoading(false);
        return;
      }

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError("Erro ao fazer login. Tente novamente.");
        setLoading(false);
        return;
      }
      if (result.redirected) {
        // Browser will redirect; keep loading state
        return;
      }
      // Tokens received and session set by lovable integration.
      // On iOS Safari, the onAuthStateChange listener can be slow/unreliable
      // after setSession — so we explicitly verify the session is persisted.
      let confirmed = false;
      for (let i = 0; i < 30; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          confirmed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!confirmed) {
        setError("Sessão não pôde ser estabelecida. Tente novamente.");
        setLoading(false);
        return;
      }

      // CRITICAL for iOS Safari: give WebKit time to flush localStorage to
      // disk before navigating. iOS WebKit can swallow pending writes if
      // navigation happens too fast after setSession(). Then use a hard
      // navigation (assign, NOT replace) — replace() in iOS Safari has been
      // observed to drop the just-written session in some flows.
      await new Promise((r) => setTimeout(r, 400));
      window.location.assign("/");
    } catch (err) {
      console.error("[login] OAuth error:", err);
      setError("Erro inesperado. Tente novamente.");
      setLoading(false);
    }
  };

  const sports = ["Padel", "Tênis", "Beach Tennis", "Squash", "Pickleball"];
  const stats = [
    { label: "Ranking", value: "Elo" },
    { label: "Agenda", value: "Auto" },
    { label: "Resultados", value: "Histórico" },
  ];
  const features = [
    { icon: TrendingUp, title: "Rating dinâmico", desc: "Sobe e desce a cada partida" },
    { icon: Calendar, title: "Rodadas automáticas", desc: "Sorteio inteligente de duplas" },
    { icon: Sparkles, title: "Estatísticas reais", desc: "Vitórias, sets, games e streaks" },
  ];

  const GoogleButton = (
    <button
      onClick={handleGoogleLogin}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-full bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 shadow-lg shadow-primary/20"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      {loading ? "Entrando..." : "Entrar com Google"}
    </button>
  );

  const InstallButton = !isInstalled && canInstall && !isFlowActive && (
    <button
      onClick={() => void startInstall()}
      className="lg:hidden flex w-full items-center justify-center gap-3 rounded-full border-2 border-primary/30 bg-card px-6 py-3 text-sm font-semibold text-foreground transition-all hover:bg-primary/10 active:scale-[0.98]"
    >
      <Download className="h-5 w-5 text-primary" />
      Instalar aplicativo
    </button>
  );

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-background text-foreground lg:h-screen lg:overflow-hidden">
      {/* === Premium continuous background — fixed to viewport so it never cuts === */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-background" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(60vw 60vw at 12% 8%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 65%),
            radial-gradient(55vw 55vw at 92% 92%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 70%),
            radial-gradient(40vw 40vw at 88% 12%, color-mix(in oklab, var(--primary) 5%, transparent), transparent 70%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 60%, color-mix(in oklab, var(--background) 70%, transparent) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-5 py-4 sm:px-6 sm:py-6 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:px-12 lg:py-10">
        {/* === LEFT / TOP === */}
        <div className="flex flex-col lg:flex-none lg:items-center lg:text-center">
          {/* Hero logo */}
          <div className="relative flex items-center justify-center">
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 blur-2xl"
                style={{
                  background:
                    "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%)",
                  transform: "scale(1.15)",
                }}
              />
              <img
                src={logoSquareNeon}
                alt="RankMyMatch"
                className="relative h-28 w-auto object-contain sm:h-36 lg:h-56 animate-float"
                style={{
                  filter:
                    "drop-shadow(0 8px 24px color-mix(in oklab, var(--primary) 25%, transparent))",
                }}
              />
            </div>
          </div>

          {/* Headline */}
          <div className="mt-3 lg:mt-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-2.5 py-0.5 backdrop-blur-sm lg:mb-3 lg:px-3 lg:py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground lg:text-[11px]">
                Para feirinos, clubes e amigos
              </span>
            </div>
            <h1 className="font-black leading-[1.05] tracking-tight text-2xl sm:text-4xl lg:text-5xl xl:text-[3.5rem]">
              <span className="block text-foreground">Pare de anotar resultado</span>
              <span className="block bg-gradient-to-r from-primary via-primary to-primary/70 bg-clip-text text-transparent">
                na planilha do WhatsApp.
              </span>
            </h1>
            <p className="mt-2.5 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm lg:mx-auto lg:mt-4 lg:text-[15px]">
              Rankings Elo, temporadas e estatísticas automáticas para padel,
              tênis, beach tennis e mais.
            </p>
          </div>

          {/* Stat cards */}
          <div className="mt-3 grid w-full grid-cols-3 gap-2 lg:mt-6 lg:max-w-md lg:gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 px-2 py-2.5 text-center backdrop-blur-md transition-all hover:border-primary/40 hover:bg-card/80 lg:py-3.5"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60"
                />
                <span className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground lg:text-[10px]">
                  {s.label}
                </span>
                <span className="mt-1 block text-sm font-bold text-primary lg:text-base">
                  {s.value}
                </span>
              </div>
            ))}
          </div>

          {/* Feature list — visible on mobile, hidden on desktop */}
          <div className="mt-3 space-y-2 lg:hidden">
            {features.map((f) => (
              <div
                key={f.title}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 px-3 py-2 backdrop-blur-sm"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold leading-tight text-foreground">
                    {f.title}
                  </p>
                  <p className="text-[10.5px] leading-tight text-muted-foreground">
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* === RIGHT / BOTTOM — CTA === */}
        <div className="mt-auto pt-4 lg:mt-0 lg:pt-0">
          <div className="relative rounded-3xl border border-border/70 bg-card/50 p-4 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)] sm:p-6 lg:p-8">
            {/* top accent line */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
            />

            {/* Features — visible on desktop inside the CTA card */}
            <div className="mb-5 hidden space-y-2 lg:block">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/30 px-3 py-2.5 backdrop-blur-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-[13px] font-semibold leading-tight text-foreground">
                      {f.title}
                    </p>
                    <p className="text-[11px] leading-tight text-muted-foreground">
                      {f.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-5">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Esportes suportados
              </p>
              <div className="flex flex-nowrap gap-1.5 overflow-x-hidden">
                {sports.map((sport) => (
                  <span
                    key={sport}
                    className="shrink-0 rounded-full border border-border/70 bg-background/40 px-2 py-1 text-[10px] font-medium text-foreground/80 backdrop-blur-sm sm:px-2.5 sm:text-[11px]"
                  >
                    {sport}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {GoogleButton}

              {error && (
                <p className="text-center text-sm text-destructive">{error}</p>
              )}

              {InstallButton}

              <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
                Ao entrar, você concorda com nossos Termos de Uso e Política de Privacidade.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


