import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { ArrowRight, CalendarDays, TrendingUp, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppleSignInButton } from "@/components/AppleSignInButton";
import logo from "@/assets/logo-horizontal-dark.png";
import court from "@/assets/landing-padel-editorial.jpg";

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


  const signIn = (location: string, label = "Começar com Google") => (
    <Button disabled={loading} onClick={() => void handleGoogleLogin(location)} className="h-11 gap-3 rounded-full px-5 font-semibold shadow-none">
      {loading ? <Loader2 className="animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
      {loading ? "Entrando..." : label}
      <ArrowRight />
    </Button>
  );

  return (
    <main className="landing-page bg-background text-foreground">
      <header className="landing-header mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 sm:px-8">
        <Link to="/" aria-label="Raqueteia — início" className="min-w-0 w-fit">
          <img src={logo} alt="Raqueteia" width={1920} height={640} className="w-[174px] max-w-full sm:w-[210px]" />
        </Link>
        <div className="flex shrink-0 items-center gap-5">
          <a href="#na-quadra" className="hidden text-xs text-muted-foreground transition-colors hover:text-foreground sm:block">Conheça o app</a>
          <Button variant="outline" disabled={loading} onClick={() => void handleGoogleLogin("header")} className="h-9 rounded-full bg-card px-4 shadow-none">Entrar <ArrowRight /></Button>
        </div>
      </header>

      <section className="landing-court relative isolate overflow-hidden">
        <img src={court} alt="Raquete e bolas em uma quadra de pádel" width={1536} height={1024} fetchPriority="high" className="landing-court-photo absolute inset-0 -z-20 h-full w-full object-cover" />
        <div aria-hidden className="landing-court-shade absolute inset-0 -z-10" />
        <div className="landing-hero-content mx-auto flex h-full max-w-6xl flex-col justify-center px-5 sm:px-8">
          <p className="mb-5 flex items-center gap-3 text-xs font-medium text-primary"><span className="h-px w-7 bg-primary" /> SEU GRUPO. SEU JOGO.</p>
          <h1 className="font-display text-[38px] font-semibold leading-[1.1] sm:text-[52px]">Raqueteia<span className="mt-2 block text-[28px] font-medium text-foreground sm:text-[36px]">O pádel continua<br />fora da quadra.</span></h1>
          <p className="mt-5 max-w-[320px] text-sm leading-6 text-foreground/80">Reúna seu grupo, organize as rodadas e acompanhe cada conquista no ranking.</p>
          <div className="mt-7 w-fit">{signIn("hero_primary")}</div>
          <p className="mt-3 text-xs text-foreground/70">Grátis para começar.</p>
          {error && <p role="alert" className="mt-3 max-w-sm text-sm text-destructive">{error}</p>}
        </div>
        <div className="landing-photo-caption absolute bottom-5 right-6 hidden items-center gap-2 text-xs text-foreground/70 sm:flex"><span className="h-1 w-1 rounded-full bg-primary" /> Da próxima rodada ao próximo pódio.</div>
      </section>

      <section id="na-quadra" className="border-b border-border scroll-mt-4">
        <div className="mx-auto grid max-w-6xl gap-0 px-5 sm:grid-cols-3 sm:px-8">
          {[
            { icon: Users, title: "Seu grupo, reunido", text: "Convites, duplas e presença em um só lugar." },
            { icon: CalendarDays, title: "A próxima rodada", text: "Agenda, sorteio e placares sem planilhas." },
            { icon: TrendingUp, title: "Cada jogo conta", text: "Ranking Elo e evolução a cada resultado." },
          ].map(({ icon: Icon, title, text }, index) => (
            <article key={title} className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-3 border-b border-border py-6 last:border-b-0 sm:border-b-0 sm:px-5 sm:first:pl-0 sm:last:pr-0">
              <Icon className="mt-0.5 h-5 w-5 text-primary" strokeWidth={1.5} />
              <div className="min-w-0"><p className="mb-2 font-display text-sm font-semibold"><span className="mr-2 text-[10px] font-normal text-muted-foreground">0{index + 1}</span>{title}</p><p className="max-w-[250px] text-xs leading-5 text-muted-foreground">{text}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-8 sm:py-16">
        <div className="min-w-0"><p className="mb-3 text-xs text-primary">MAIS JOGO. MENOS ORGANIZAÇÃO.</p><h2 className="font-display text-2xl font-medium leading-snug sm:text-3xl">O próximo jogo começa<br />com o seu grupo.</h2><p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">Entre, convide os amigos e deixe os resultados contarem a história da temporada.</p></div>
        <div className="w-fit max-w-full space-y-3">{signIn("final_cta")}<AppleSignInButton variant="outline" onError={setError} /><p className="max-w-[270px] text-[11px] leading-5 text-muted-foreground">Ao entrar, você concorda com os <Link to="/termos" className="underline underline-offset-2 hover:text-foreground">Termos</Link> e a <Link to="/privacidade" className="underline underline-offset-2 hover:text-foreground">Política de Privacidade</Link>.</p></div>
      </section>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© {new Date().getFullYear()} Raqueteia</span><nav aria-label="Links institucionais" className="flex gap-5"><Link to="/sobre-desenvolvimento" className="hover:text-foreground">Sobre</Link><Link to="/changelog" className="hover:text-foreground">Novidades</Link><Link to="/privacidade" className="hover:text-foreground">Privacidade</Link></nav>
        </div>
      </footer>
    </main>
  );
}
