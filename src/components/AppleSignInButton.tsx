import { useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

interface AppleSignInButtonProps {
  /** URL to redirect to after successful sign-in. Defaults to current origin. */
  redirectUri?: string;
  /** Where to navigate (window.location.assign/replace) once session is confirmed. */
  postLoginNavigate?: string;
  /** Use replace instead of assign for navigation (e.g. invite flow). */
  useReplace?: boolean;
  /** Optional callback fired when sign-in fails. */
  onError?: (message: string) => void;
  /** Optional callback fired when the click is registered (for analytics). */
  onClick?: () => void;
  /** Visual style variant. */
  variant?: "primary" | "outline";
  /** Tailwind className override for sizing/padding. */
  className?: string;
}

/**
 * Apple Sign In button matching Apple Human Interface Guidelines.
 * Black background with white Apple logo and "Continue with Apple" wording in PT-BR.
 */
export function AppleSignInButton({
  redirectUri,
  postLoginNavigate = "/",
  useReplace = false,
  onError,
  onClick,
  variant = "outline",
  className = "",
}: AppleSignInButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    onClick?.();
    setLoading(true);
    try {
      try {
        const testKey = "__rmm_ls_test__";
        window.localStorage.setItem(testKey, "1");
        window.localStorage.removeItem(testKey);
      } catch {
        onError?.(
          "Seu navegador está bloqueando o armazenamento local (talvez Modo Privado do Safari). Abra em uma aba normal para entrar.",
        );
        setLoading(false);
        return;
      }

      const result = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: redirectUri ?? window.location.origin,
      });

      if (result.error) {
        onError?.("Erro ao fazer login com Apple. Tente novamente.");
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
        onError?.("Sessão não pôde ser estabelecida. Tente novamente.");
        setLoading(false);
        return;
      }

      await new Promise((r) => setTimeout(r, 400));
      if (useReplace) {
        window.location.replace(postLoginNavigate);
      } else {
        window.location.assign(postLoginNavigate);
      }
    } catch (err) {
      console.error("[apple-signin] OAuth error:", err);
      onError?.("Erro inesperado. Tente novamente.");
      setLoading(false);
    }
  };

  const baseClasses =
    variant === "primary"
      ? "flex w-full items-center justify-center gap-3 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-all hover:bg-foreground/90 active:scale-[0.98] disabled:opacity-60 shadow-lg sm:py-4"
      : "flex w-full items-center justify-center gap-3 rounded-full border-2 border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted active:scale-[0.98] disabled:opacity-60 sm:py-4";

  return (
    <button onClick={handleClick} disabled={loading} className={`${baseClasses} ${className}`}>
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
      {loading ? "Entrando..." : "Continuar com Apple"}
    </button>
  );
}
