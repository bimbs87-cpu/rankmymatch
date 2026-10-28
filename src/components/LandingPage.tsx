import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { ArrowRight, CalendarDays, TrendingUp, Users, Loader2, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppleSignInButton } from "@/components/AppleSignInButton";
import logo from "@/assets/logo-horizontal-dark.png";
import rankingScreen from "@/assets/raqueteia-ranking-real.webp.asset.json";
import { useInstallFlow } from "@/components/InstallFlowProvider";

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
  const { canInstall, isInstalled, isFlowActive, startInstall } = useInstallFlow();
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


  const signIn = (location: string) => (
    <Button disabled={loading} onClick={() => void handleGoogleLogin(location)} className="h-11 gap-3 rounded-full px-5 font-semibold shadow-none">
      {loading ? <Loader2 className="animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
      {loading ? "Entrando..." : "Entrar com Google"}
      <ArrowRight />
    </Button>
  );

  return (
    <main className="landing-page bg-background text-foreground">
      <header className="landing-header landing-container grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border">
        <Link to="/" aria-label="Raqueteia — início" className="min-w-0 w-fit">
          <img src={logo} alt="Raqueteia" width={1920} height={640} className="w-[172px] max-w-full sm:w-[204px]" />
        </Link>
        <nav aria-label="Navegação principal" className="flex shrink-0 items-center gap-6">
          <a href="#experiencia" className="hidden text-xs text-muted-foreground hover:text-foreground sm:block">A experiência</a>
          <Button variant="ghost" disabled={loading} onClick={() => void handleGoogleLogin("header")} className="h-9 px-0 text-xs">Entrar <ArrowRight /></Button>
        </nav>
      </header>

      <section className="landing-intro landing-container">
        <div className="landing-copy min-w-0">
          <p className="mb-6 flex items-center gap-3 text-[11px] font-medium text-muted-foreground"><span className="h-px w-6 bg-primary" /> PÁDEL · GRUPOS · COMPETIÇÃO</p>
          <h1 className="font-display text-[36px] font-medium leading-[1.08]">Seu jogo.<br /><span className="text-primary">Em outro nível.</span></h1>
          <p className="mt-5 max-w-[360px] text-sm leading-6 text-muted-foreground">Da primeira rodada ao topo do ranking. Um lugar para reunir seu grupo e dar valor a cada partida.</p>
          <div className="mt-7 space-y-3">
            <div className="w-fit">{signIn("hero_primary")}</div>
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground"><Check className="h-3.5 w-3.5 text-primary" /> Grátis para começar. Sem senha para lembrar.</p>
          </div>
          {error && <p role="alert" className="mt-4 max-w-sm text-sm text-destructive">{error}</p>}
        </div>

        <figure className="landing-device-stage" aria-label="Tela real do ranking no celular">
          <div className="landing-device">
            <div className="landing-device-top" aria-hidden="true"><span /></div>
            <img src={rankingScreen.url} alt="Tela real do Raqueteia: ranking da temporada com pódio e pontuação dos jogadores" width={886} height={1726} fetchPriority="high" className="landing-device-screen" />
            <div className="landing-device-bottom" aria-hidden="true"><span /></div>
          </div>
        </figure>
      </section>

      <section id="experiencia" className="border-y border-border scroll-mt-4">
        <div className="landing-container grid gap-0 sm:grid-cols-3">
          {[
            { icon: Users, title: "A turma, organizada.", text: "Convites e presença. Duplas sorteadas. Todos no mesmo jogo." },
            { icon: CalendarDays, title: "A rodada, resolvida.", text: "Agenda, sets e tie-break. Do primeiro ponto ao resultado final." },
            { icon: TrendingUp, title: "A evolução, visível.", text: "Ranking Elo, estatísticas e histórico. Cada conquista tem seu lugar." },
          ].map(({ icon: Icon, title, text }, index) => <article key={title} className="border-b border-border py-7 last:border-b-0 sm:border-b-0 sm:border-r sm:px-7 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"><div className="mb-5 flex items-center justify-between"><Icon className="h-5 w-5 text-primary" strokeWidth={1.5} /><span className="font-display text-xs text-muted-foreground">0{index+1}</span></div><h2 className="font-display text-base font-medium">{title}</h2><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">{text}</p></article>)}
        </div>
      </section>

      <section className="landing-container grid gap-7 py-10 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:py-12">
        <div className="min-w-0"><h2 className="font-display text-2xl font-medium">O grupo é seu.<br />A próxima conquista também.</h2><p className="mt-3 max-w-sm text-xs leading-5 text-muted-foreground">Pádel, tênis, beach tennis, squash e pickleball.<br />Sua paixão pela raquete, em um só lugar.</p></div>
        <div className="w-full max-w-[270px] space-y-3"><AppleSignInButton variant="outline" onError={setError} />{canInstall && !isInstalled && !isFlowActive && <Button variant="outline" onClick={()=>void startInstall()} className="h-11 w-full rounded-full"><Download /> Instalar aplicativo</Button>}<p className="text-[10px] leading-5 text-muted-foreground">Ao entrar, você concorda com os <Link to="/termos" className="underline underline-offset-2 hover:text-foreground">Termos</Link> e a <Link to="/privacidade" className="underline underline-offset-2 hover:text-foreground">Política de Privacidade</Link>.</p></div>
      </section>
      <footer className="border-t border-border"><div className="landing-container flex flex-col gap-4 py-5 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} · Feito para quem vive o jogo.</span><nav aria-label="Links institucionais" className="flex gap-5"><Link to="/sobre-desenvolvimento" className="hover:text-foreground">Sobre</Link><Link to="/changelog" className="hover:text-foreground">Novidades</Link><Link to="/privacidade" className="hover:text-foreground">Privacidade</Link></nav></div></footer>
    </main>
  );
}
