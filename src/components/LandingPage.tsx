import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
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
  Activity,
  Star,
} from "lucide-react";
import logoHorizontalDark from "@/assets/logo-horizontal-dark.png";
import logoHorizontalLightPremium from "@/assets/logo-horizontal-light-premium.png";
import heroDevices from "@/assets/landing-hero-devices.png";
import heroMonitorPremium from "@/assets/landing-hero-monitor-premium.png";
import { useTheme } from "@/lib/theme";
import { AppleSignInButton } from "@/components/AppleSignInButton";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function LandingPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { resolved } = useTheme();
  const isLight = resolved === "light";

  const handleGoogleLogin = async (ctaLocation: string = "unknown") => {
    trackEvent("landing_cta_click", {
      cta: "google_login",
      location: ctaLocation,
    });
    setLoading(true);
    setError("");
    try {
      try {
        const testKey = "__rmm_ls_test__";
        window.localStorage.setItem(testKey, "1");
        window.localStorage.removeItem(testKey);
      } catch {
        setError(
          "Seu navegador está bloqueando o armazenamento local (talvez Modo Privado do Safari). Abra em uma aba normal para entrar.",
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

  const logoSrc = logoHorizontalLightPremium;

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
      desc: "Gerencie quantos grupos quiser — Feirinos, clube, amigos, tudo num lugar.",
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

  const CTAButton = ({
    size = "md",
    className = "",
    location = "unknown",
  }: {
    size?: "md" | "lg";
    className?: string;
    location?: string;
  }) => (
    <button
      onClick={() => handleGoogleLogin(location)}
      disabled={loading}
      className={`group inline-flex items-center justify-center gap-3 rounded-full bg-primary font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98] disabled:opacity-60 ${
        size === "lg" ? "px-7 py-4 text-base" : "px-6 py-3 text-sm"
      } ${className}`}
    >
      <GoogleIcon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
      {loading ? "Entrando..." : "Entrar com Google"}
      <ArrowRight
        className={`transition-transform group-hover:translate-x-0.5 ${size === "lg" ? "h-5 w-5" : "h-4 w-4"}`}
      />
    </button>
  );

  return (
    <div className="light relative min-h-[100dvh] w-full overflow-x-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-background" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: isLight
            ? `
              linear-gradient(135deg, color-mix(in oklab, var(--background) 90%, var(--rally)) 0%, var(--background) 36%, color-mix(in oklab, var(--background) 88%, var(--primary)) 100%),
              radial-gradient(64vw 42vw at 76% 14%, color-mix(in oklab, var(--rally) 34%, transparent), transparent 62%),
              radial-gradient(44vw 34vw at 5% 24%, color-mix(in oklab, var(--primary) 15%, transparent), transparent 66%),
              radial-gradient(44vw 32vw at 50% 100%, color-mix(in oklab, var(--info) 12%, transparent), transparent 70%)
            `
            : `
              radial-gradient(80vw 55vh at 50% -10%, color-mix(in oklab, var(--rally) 26%, transparent), transparent 70%),
              radial-gradient(70vw 50vh at 110% 35%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 75%),
              radial-gradient(90vw 60vh at -10% 70%, color-mix(in oklab, var(--success) 14%, transparent), transparent 75%),
              linear-gradient(180deg, color-mix(in oklab, var(--background) 84%, var(--rally)) 0%, var(--background) 48%, color-mix(in oklab, var(--background) 86%, var(--primary)) 100%)
            `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(115deg, transparent 0 42%, color-mix(in oklab, var(--primary) 16%, transparent) 42% 42.12%, transparent 42.12% 100%), linear-gradient(to right, color-mix(in oklab, var(--foreground) 7%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 72px 72px, 72px 72px",
          maskImage: "linear-gradient(to bottom, black 0%, black 62%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 62%, transparent 100%)",
        }}
      />

      <header className="relative z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:py-6">
          <img
            src={logoSrc}
            alt="RankMyMatch"
            className="h-16 w-auto max-w-[68vw] drop-shadow-sm sm:h-20 lg:h-24"
          />
          <button
            onClick={() => handleGoogleLogin("header")}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/90 px-4 py-2 text-sm font-semibold text-foreground shadow-lg shadow-primary/10 backdrop-blur-xl transition-all hover:border-primary/60 hover:bg-card sm:px-5 sm:py-2.5"
          >
            <GoogleIcon className="h-4 w-4" />
            Entrar
          </button>
        </div>
      </header>

      <section className="relative z-10">
        <div className="mx-auto grid min-h-[calc(100dvh-116px)] max-w-7xl items-center gap-8 px-5 pb-10 pt-2 sm:px-8 lg:grid-cols-[0.86fr_1.14fr] lg:gap-6 lg:pb-14">
          <div className="relative z-10 max-w-2xl text-left">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-3 py-1.5 shadow-sm backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-rally shadow-[0_0_18px_color-mix(in_oklab,var(--rally)_80%,transparent)]" />
              <span className="text-[11px] font-bold uppercase text-muted-foreground">
                Ranking premium para grupos de raquete
              </span>
            </div>

            <h1 className="font-display text-[2.7rem] font-black leading-[0.96] text-foreground sm:text-6xl lg:text-7xl">
              A central de performance do seu grupo.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Organize temporadas, registre jogos e transforme cada resultado em ranking Elo,
              estatísticas e disputas claras — com aparência de produto profissional.
            </p>

            <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <CTAButton size="lg" className="w-full sm:w-auto" location="hero_primary" />
              <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur-xl">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Grátis para começar · sem cartão
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

            <div className="mt-8 grid max-w-xl grid-cols-3 gap-2 sm:gap-3">
              {[
                { value: "Elo", label: "ranking vivo" },
                { value: "3min", label: "para criar" },
                { value: "Multi", label: "grupo" },
              ].map((stat) => (
                <div key={stat.label} className="border-l border-primary/35 bg-card/45 px-3 py-2.5 backdrop-blur-sm">
                  <div className="font-display text-xl font-black text-foreground sm:text-2xl">{stat.value}</div>
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {sports.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-border/70 bg-card/55 px-3 py-1.5 text-[11px] font-bold text-foreground/80 shadow-sm backdrop-blur-xl"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="relative -mx-12 min-h-[320px] sm:-mx-16 lg:mx-0 lg:min-h-[620px]">
            <div
              aria-hidden
              className="absolute inset-x-[10%] bottom-[7%] h-[26%] rounded-full blur-3xl"
              style={{ background: "color-mix(in oklab, var(--primary) 26%, transparent)" }}
            />
            <img
              src={heroMonitorPremium}
              alt="RankMyMatch em um monitor com ranking e estatísticas"
              className="relative z-10 ml-auto block w-[132%] max-w-none object-contain drop-shadow-2xl sm:w-[118%] lg:absolute lg:right-[-16%] lg:top-[47%] lg:w-[128%] lg:-translate-y-1/2 xl:right-[-22%] xl:w-[138%]"
              loading="eager"
            />
            <div className="absolute left-8 top-8 z-20 hidden max-w-[230px] border border-border/70 bg-card/80 p-4 shadow-2xl shadow-primary/15 backdrop-blur-2xl lg:block">
              <div className="mb-3 flex items-center justify-between">
                <Activity className="h-5 w-5 text-primary" />
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black text-primary">LIVE</span>
              </div>
              <p className="text-sm font-black text-foreground">Ranking, rodadas e histórico em uma só visão.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-y border-border/60 bg-card/50 backdrop-blur-xl">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.42fr_0.58fr] lg:py-20">
          <div>
            <p className="mb-3 text-[11px] font-black uppercase text-primary">Sistema completo</p>
            <h2 className="font-display text-3xl font-black leading-tight text-foreground sm:text-5xl">
              Do placar ao pódio, sem ruído operacional.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Uma experiência mais editorial, clara e confiável para o público que chega em
              /landing ou / antes de entrar.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((f) => (
              <div
                key={f.title}
                className="group border border-border/70 bg-background/70 p-5 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-xl hover:shadow-primary/10"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-black text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-20">
          <div className="grid overflow-hidden border border-border/70 bg-card/75 shadow-2xl shadow-primary/10 backdrop-blur-xl lg:grid-cols-[0.95fr_1.05fr]">
            <div className="p-6 sm:p-10 lg:p-12">
              <p className="mb-3 text-[11px] font-black uppercase text-primary">Fluxo simples</p>
              <h2 className="font-display text-3xl font-black leading-tight text-foreground sm:text-5xl">
                Entre, crie o grupo e deixe o ranking trabalhar.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                O produto substitui planilhas e conversas perdidas por um ritual claro para cada rodada.
              </p>
              <p className="mt-6 text-xs font-semibold text-muted-foreground">
                <Zap className="mr-1 inline h-4 w-4 text-primary" />
                Login em 1 clique, sem cartão para começar.
              </p>
            </div>
            <div className="border-t border-border/70 lg:border-l lg:border-t-0">
              {steps.map((s, index) => (
                <div key={s.n} className="grid grid-cols-[76px_1fr] border-b border-border/70 last:border-b-0">
                  <div className="flex items-center justify-center bg-secondary/70 font-display text-2xl font-black text-primary">
                    {s.n}
                  </div>
                  <div className="p-5 sm:p-7">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-rally" />
                      <span className="text-[10px] font-black uppercase text-muted-foreground">Etapa {index + 1}</span>
                    </div>
                    <h3 className="text-lg font-black text-foreground">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 pb-12 sm:pb-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="relative overflow-hidden bg-foreground px-6 py-10 text-background shadow-2xl shadow-primary/20 sm:px-10 lg:px-14 lg:py-14">
            <div
              aria-hidden
              className="absolute inset-0 opacity-70"
              style={{
                background:
                  "radial-gradient(44vw 30vw at 78% 16%, color-mix(in oklab, var(--rally) 44%, transparent), transparent 70%), radial-gradient(34vw 24vw at 8% 100%, color-mix(in oklab, var(--primary) 38%, transparent), transparent 72%)",
              }}
            />
            <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 bg-background/10 px-3 py-1.5 text-[11px] font-black uppercase text-background backdrop-blur-md">
                  <Star className="h-3.5 w-3.5" />
                  Pronto para competir melhor
                </div>
                <h2 className="font-display text-3xl font-black leading-tight sm:text-5xl">
                  Troque a planilha por uma experiência de ranking premium.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-background/75 sm:text-base">
                  Entre com Google, crie seu primeiro grupo e organize temporadas com visual profissional desde o primeiro acesso.
                </p>
              </div>
              <div className="flex w-full max-w-sm flex-col gap-3 lg:w-[360px]">
                <CTAButton size="lg" className="w-full shadow-none" location="final_cta" />
                <AppleSignInButton variant="outline" onError={(msg) => setError(msg)} />
                <p className="text-center text-[11px] text-background/65">
                  Ao entrar, você concorda com nossos{" "}
                  <Link to="/termos" className="underline hover:text-background">Termos</Link>
                  {" "}e{" "}
                  <Link to="/privacidade" className="underline hover:text-background">Privacidade</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/50 bg-card/45 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:px-8">
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="RankMyMatch" className="h-9 w-auto" />
            <span>© {new Date().getFullYear()} RankMyMatch</span>
          </div>
          <div className="flex items-center gap-5 font-semibold">
            <a href="/sobre-desenvolvimento" className="hover:text-foreground">Sobre</a>
            <a href="/changelog" className="hover:text-foreground">Changelog</a>
            <a href="/login" className="hover:text-foreground">Entrar</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
