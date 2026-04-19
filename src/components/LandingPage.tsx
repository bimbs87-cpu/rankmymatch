import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp,
  Calendar,
  Sparkles,
  Trophy,
  Users,
  BarChart3,
  ShieldCheck,
  Zap,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import logoHorizontalDark from "@/assets/logo-horizontal-dark.png";
import logoHorizontalLight from "@/assets/logo-horizontal-light.png";
import heroDevices from "@/assets/landing-hero-devices.png";
import { useTheme } from "@/lib/theme";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function LandingPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { resolved: resolvedTheme } = useTheme();
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      try {
        const testKey = "__rmm_ls_test__";
        window.localStorage.setItem(testKey, "1");
        window.localStorage.removeItem(testKey);
      } catch {
        setError(
          "Seu navegador está bloqueando o armazenamento local (talvez Modo Privado do Safari). Abra em uma aba normal para entrar."
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
      if (result.redirected) return;

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
      await new Promise((r) => setTimeout(r, 400));
      window.location.assign("/");
    } catch (err) {
      console.error("[landing] OAuth error:", err);
      setError("Erro inesperado. Tente novamente.");
      setLoading(false);
    }
  };

  const logoSrc = resolvedTheme === "dark" ? logoHorizontalDark : logoHorizontalLight;

  const features = [
    {
      icon: TrendingUp,
      title: "Ranking Elo dinâmico",
      desc: "Rating sobe e desce a cada partida, com peso por resultado e oponente.",
    },
    {
      icon: Calendar,
      title: "Rodadas automáticas",
      desc: "Sorteio inteligente de duplas e gestão de presença por rodada.",
    },
    {
      icon: BarChart3,
      title: "Estatísticas avançadas",
      desc: "Vitórias, sets, games, streaks, head-to-head e gráficos de evolução.",
    },
    {
      icon: Trophy,
      title: "Temporadas e prêmios",
      desc: "Crie temporadas com pódio, ranking final e medalhas para os destaques.",
    },
    {
      icon: Users,
      title: "Multi-grupo",
      desc: "Gerencie quantos grupos quiser — feirinha, clube, amigos, tudo num lugar.",
    },
    {
      icon: ShieldCheck,
      title: "Sem planilha, sem bagunça",
      desc: "Resultados validados pelos jogadores, com histórico e auditoria.",
    },
  ];

  const steps = [
    { n: "01", title: "Entre com Google", desc: "Login em 1 clique. Sem cadastro, sem senha." },
    { n: "02", title: "Crie ou entre em um grupo", desc: "Convide amigos por link e comece a registrar partidas." },
    { n: "03", title: "Veja o ranking subir", desc: "Resultados viram Elo, estatísticas e troféus automaticamente." },
  ];

  const sports = ["Padel", "Tênis", "Beach Tennis", "Squash", "Pickleball"];

  const CTAButton = ({ size = "md" }: { size?: "md" | "lg" }) => (
    <button
      onClick={handleGoogleLogin}
      disabled={loading}
      className={`group inline-flex items-center justify-center gap-3 rounded-full bg-primary font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98] disabled:opacity-60 ${
        size === "lg" ? "px-7 py-4 text-base" : "px-6 py-3 text-sm"
      }`}
    >
      <GoogleIcon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
      {loading ? "Entrando..." : "Entrar com Google"}
      <ArrowRight className={`transition-transform group-hover:translate-x-0.5 ${size === "lg" ? "h-5 w-5" : "h-4 w-4"}`} />
    </button>
  );

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-background text-foreground">
      {/* === Background layers === */}
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

      {/* === Header === */}
      <header className="relative z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
          <img src={logoSrc} alt="RankMyMatch" className="h-8 w-auto sm:h-10" />
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/60 px-4 py-2 text-sm font-medium text-foreground backdrop-blur-md transition-all hover:border-primary/50 hover:bg-card sm:inline-flex"
          >
            <GoogleIcon className="h-4 w-4" />
            Entrar
          </button>
        </div>
      </header>

      {/* === Hero === */}
      <section className="relative z-10">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-8 sm:px-8 sm:py-14 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-20">
          <div className="text-center lg:text-left">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Para feirinha, clube e amigos
              </span>
            </div>

            <h1 className="font-black leading-[1.05] tracking-tight text-3xl sm:text-5xl lg:text-6xl">
              <span className="block text-foreground">Registre seu</span>
              <span className="block">
                <span className="bg-gradient-to-r from-primary via-primary to-primary/70 bg-clip-text text-transparent">
                  grupo ou feirinha
                </span>
              </span>
              <span className="block text-foreground">em um só lugar</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base lg:mx-0 lg:text-lg">
              <span className="font-semibold text-foreground">Estatísticas avançadas</span>,
              ranking Elo dinâmico e gestão de temporadas para padel, tênis, beach tennis e mais.
              Pare de anotar resultado em planilha do WhatsApp.
            </p>

            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <CTAButton size="lg" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Grátis para começar · sem cartão</span>
              </div>
            </div>

            {error && (
              <p className="mt-4 text-center text-sm text-destructive lg:text-left">{error}</p>
            )}

            <div className="mt-8">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Esportes suportados
              </p>
              <div className="flex flex-wrap justify-center gap-1.5 lg:justify-start">
                {sports.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-border/70 bg-card/50 px-2.5 py-1 text-[11px] font-medium text-foreground/80 backdrop-blur-sm"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Hero image */}
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 blur-3xl"
              style={{
                background:
                  "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%)",
              }}
            />
            <img
              src={heroDevices}
              alt="RankMyMatch em desktop, tablet e celular: ranking, perfil e estatísticas"
              className="relative w-full rounded-2xl object-contain"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* === Features === */}
      <section className="relative z-10 border-t border-border/40">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-black tracking-tight sm:text-4xl">
              Tudo que sua <span className="text-primary">feirinha</span> precisa
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Da rodada de quarta-feira ao campeonato anual. Sem planilha, sem confusão.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-md transition-all hover:border-primary/40 hover:bg-card/70"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60"
                />
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === How it works === */}
      <section className="relative z-10 border-t border-border/40">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-black tracking-tight sm:text-4xl">
              Comece em <span className="text-primary">3 passos</span>
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Do login à primeira partida em menos de 2 minutos.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.n}
                className="relative rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-md"
              >
                <div className="mb-3 inline-flex h-10 items-center justify-center rounded-full bg-primary/10 px-3 text-sm font-black text-primary">
                  {s.n}
                </div>
                <h3 className="text-base font-bold text-foreground">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center gap-3">
            <CTAButton size="lg" />
            <p className="text-xs text-muted-foreground">
              <Zap className="mr-1 inline h-3.5 w-3.5 text-primary" />
              Sem cadastro: 1 clique e você já está no ranking.
            </p>
          </div>
        </div>
      </section>

      {/* === Final CTA === */}
      <section className="relative z-10 border-t border-border/40">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-card/60 p-8 text-center backdrop-blur-xl sm:p-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(ellipse at top, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%)",
              }}
            />
            <Sparkles className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h2 className="text-2xl font-black tracking-tight sm:text-4xl">
              Bora subir no <span className="text-primary">ranking</span>?
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
              Junte-se a feirinhas e clubes que já largaram a planilha.
              Entre com Google e crie seu primeiro grupo agora.
            </p>
            <div className="mt-7 flex justify-center">
              <CTAButton size="lg" />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Ao entrar, você concorda com nossos Termos de Uso e Política de Privacidade.
            </p>
          </div>
        </div>
      </section>

      {/* === Footer === */}
      <footer className="relative z-10 border-t border-border/40">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:px-8">
          <div className="flex items-center gap-2">
            <img src={logoSrc} alt="RankMyMatch" className="h-6 w-auto" />
            <span>© {new Date().getFullYear()} RankMyMatch</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/sobre-desenvolvimento" className="hover:text-foreground">Sobre</a>
            <a href="/changelog" className="hover:text-foreground">Changelog</a>
            <a href="/login" className="hover:text-foreground">Entrar</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
