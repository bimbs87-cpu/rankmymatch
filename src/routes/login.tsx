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

  const logoSrc = resolvedTheme === "light" ? logoHorizontalLight : logoHorizontalDark;

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
      className="flex w-full items-center justify-center gap-3 rounded-full bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60"
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
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center lg:max-w-5xl lg:mx-auto lg:min-h-screen lg:px-12 lg:py-16">
      {/* MOBILE: top zone (~55%) with gradient + DESKTOP: left column */}
      <div className="flex flex-col bg-gradient-to-b from-primary/10 to-background lg:bg-none min-h-[55vh] lg:min-h-0 pt-12 lg:pt-0">
        <img src={logoSrc} alt="RankMyMatch" className="h-7 w-auto px-6 lg:px-0" />

        <div className="px-6 lg:px-0 mt-6 lg:mt-8">
          <h1 className="font-black text-3xl lg:text-5xl leading-tight">
            <span className="block text-foreground">Pare de anotar resultado</span>
            <span className="block text-primary">na planilha do WhatsApp.</span>
          </h1>
        </div>

        <div className="flex gap-2 px-6 lg:px-0 mt-4 lg:mt-8">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex-1 bg-card border border-border rounded-xl px-2 py-2 text-center"
            >
              <span className="text-[9px] text-muted-foreground block uppercase tracking-wide">
                {s.label}
              </span>
              <span className="text-xs font-bold text-primary block mt-0.5">
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* MOBILE: bottom zone (rest) + DESKTOP: right column */}
      <div className="flex flex-col justify-end pb-10 px-6 lg:px-0 lg:justify-center flex-1 lg:flex-none">
        <div className="flex flex-wrap gap-2 mb-6">
          {sports.map((sport) => (
            <span
              key={sport}
              className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground"
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

          <p className="text-[11px] text-muted-foreground text-center mt-3">
            Ao entrar, você concorda com nossos Termos de Uso e Política de Privacidade.
          </p>
        </div>
      </div>
    </div>
  );
}
