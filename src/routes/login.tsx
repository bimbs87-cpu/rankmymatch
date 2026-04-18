import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { Button } from "@/components/ui/button";
import { Zap, Users, BarChart3, Trophy, Download } from "lucide-react";
import logoHorizontalDark from "@/assets/logo-horizontal-dark.png";
import logoHorizontalLight from "@/assets/logo-horizontal-light.png";
import logoSquareNeon from "@/assets/logo-square-neon.png";
import { useTheme } from "@/lib/theme";
import { useInstallFlow } from "@/components/InstallFlowProvider";

export const Route = createFileRoute("/login")({
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
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[420px] w-[420px] rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[480px] w-[480px] rounded-full bg-primary/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 lg:grid lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:px-12 lg:py-12">
        {/* LEFT / TOP — Logo + headline */}
        <div className="flex flex-1 flex-col lg:flex-none">
          {/* Hero logo block */}
          <div className="relative flex items-center justify-center lg:justify-start">
            {/* radial glow behind logo */}
            <div className="pointer-events-none absolute inset-0 -z-0 mx-auto h-full w-full max-w-md bg-[radial-gradient(circle_at_center,theme(colors.primary/25%),transparent_60%)]" />
            <img
              src={logoSquareNeon}
              alt="RankMyMatch"
              className="relative z-10 h-44 w-auto object-contain drop-shadow-[0_0_40px_rgba(190,255,40,0.35)] sm:h-52 lg:h-72"
            />
          </div>

          {/* Headline */}
          <div className="mt-6 lg:mt-10">
            <h1 className="font-black leading-[1.05] tracking-tight text-3xl sm:text-4xl lg:text-5xl xl:text-6xl">
              <span className="block text-foreground">Pare de anotar resultado</span>
              <span className="block text-primary">na planilha do WhatsApp.</span>
            </h1>
            <p className="mt-4 text-sm text-muted-foreground sm:text-base lg:text-lg lg:max-w-md">
              Rankings, temporadas e estatísticas para padel, tênis, beach tennis e mais.
            </p>
          </div>

          {/* Stat cards */}
          <div className="mt-6 grid grid-cols-3 gap-2 lg:mt-8 lg:gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-border bg-card/80 backdrop-blur px-2 py-3 text-center lg:py-4"
              >
                <span className="block text-[9px] uppercase tracking-wider text-muted-foreground lg:text-[10px]">
                  {s.label}
                </span>
                <span className="mt-1 block text-sm font-bold text-primary lg:text-base">
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT / BOTTOM — CTA */}
        <div className="mt-8 flex flex-col lg:mt-0">
          <div className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-md sm:p-6 lg:p-8">
            <div className="mb-5 flex flex-wrap gap-2">
              {sports.map((sport) => (
                <span
                  key={sport}
                  className="rounded-full border border-border bg-background/60 px-3 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  {sport}
                </span>
              ))}
            </div>

            <div className="space-y-3">
              {GoogleButton}

              {error && (
                <p className="text-center text-sm text-destructive">{error}</p>
              )}

              {InstallButton}

              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Ao entrar, você concorda com nossos Termos de Uso e Política de Privacidade.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

