import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

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
      (_event, nextSession) => {
        syncAuthState(nextSession);
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
