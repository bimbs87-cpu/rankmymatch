import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface UserProfile {
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  avatar_type: string | null;
}

interface UserProfileState {
  profile: UserProfile | null;
  /** Display name: profile name > Google name > "Jogador" */
  displayName: string;
  /** Nickname from profile (may be null) */
  nickname: string | null;
  /** Resolved avatar URL: profile avatar > Google photo > null */
  avatarUrl: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const UserProfileContext = createContext<UserProfileState>({
  profile: null,
  displayName: "Jogador",
  nickname: null,
  avatarUrl: null,
  isLoading: true,
  refresh: async () => {},
});

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await supabase
        .from("user_profiles")
        .select("name, nickname, avatar_url, avatar_type")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setProfile(data as UserProfile);
    } catch (e) {
      console.error("Erro ao carregar perfil:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setIsLoading(true);
    loadProfile();
  }, [loadProfile]);

  const googleName = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
  const googlePhoto = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  const displayName = profile?.name || googleName || "Jogador";
  const nickname = profile?.nickname || null;
  const avatarUrl = profile?.avatar_url || googlePhoto;

  return (
    <UserProfileContext.Provider
      value={{ profile, displayName, nickname, avatarUrl, isLoading, refresh: loadProfile }}
    >
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  return useContext(UserProfileContext);
}
