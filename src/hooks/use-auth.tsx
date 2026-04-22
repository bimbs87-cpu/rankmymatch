import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { saveAcquisitionForUser, logUserSession } from "@/lib/acquisition-tracking";

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: true,
  signOut: async () => {},
});

async function ensureUserProfile(user: User) {
  try {
    const { data: existing, error } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Erro ao verificar perfil do usuário:", error);
      return;
    }

    if (existing) return;

    const meta = user.user_metadata;
    const { error: insertError } = await supabase.from("user_profiles").insert({
      user_id: user.id,
      name: meta?.full_name || meta?.name || "",
      nickname: meta?.preferred_username || "",
      avatar_url: meta?.avatar_url || meta?.picture || "",
      avatar_type: "google",
    });

    if (insertError) {
      console.error("Erro ao criar perfil do usuário:", insertError);
    }
  } catch (error) {
    console.error("Erro inesperado ao preparar perfil do usuário:", error);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const syncAuthState = (nextSession: Session | null) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);

      if (nextSession?.user) {
        void ensureUserProfile(nextSession.user);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        syncAuthState(nextSession);

        // Detect first-time signup → fire conversion ONCE per user + save acquisition
        if (event === "SIGNED_IN" && nextSession?.user) {
          const u = nextSession.user;
          // Daily session log (idempotente via UNIQUE constraint)
          void logUserSession(u.id);
          try {
            const created = u.created_at ? new Date(u.created_at).getTime() : 0;
            const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
            const isFirstSignIn = created && lastSignIn && Math.abs(lastSignIn - created) < 60_000;
            const flagKey = `rmm-signup-tracked-${u.id}`;
            if (isFirstSignIn && typeof window !== "undefined" && !window.localStorage.getItem(flagKey)) {
              window.localStorage.setItem(flagKey, "1");
              void import("@/lib/analytics").then(({ trackConversion }) => {
                trackConversion("sign_up", { method: "google" });
              });
              // Salva atribuição (UTM/invite/referrer) capturada antes do cadastro
              void saveAcquisitionForUser(u.id);
              void import("@/lib/onboarding-events").then(({ trackOnboardingStep }) => {
                trackOnboardingStep("signup", { provider: u.app_metadata?.provider });
              });
            } else {
              // Garantia: se cadastro existe mas user_acquisition ainda não, tenta gravar
              void saveAcquisitionForUser(u.id);
            }
          } catch {
            /* analytics best-effort */
          }
        }
      }
    );

    void supabase.auth
      .getSession()
      .then(({ data: { session: currentSession } }) => {
        syncAuthState(currentSession);
      })
      .catch((error) => {
        console.error("Erro ao restaurar sessão:", error);
        setIsLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated: !!session,
        isLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
