import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { EloChart } from "@/components/EloChart";
import { useEffect, useState } from "react";
import {
  LogOut,
  ChevronRight,
  Settings,
  Award,
  History,
  Shield,
  Camera,
  AtSign,
} from "lucide-react";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

interface Profile {
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  dominant_hand: string | null;
  preferred_position: string | null;
  killer_shot: string | null;
  worst_shot: string | null;
  instagram_handle: string | null;
}

function ProfilePage() {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      navigate({ to: "/login" });
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("name, nickname, avatar_url, dominant_hand, preferred_position, killer_shot, worst_shot, instagram_handle")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data as Profile);
        setLoadingProfile(false);
      });
  }, [user]);

  if (isLoading || loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const displayName = profile?.name || user?.user_metadata?.full_name || "Jogador";

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const shotLabel = (shot: string | null) => {
    if (!shot || shot === "none") return "Nenhum";
    return shot.charAt(0).toUpperCase() + shot.slice(1);
  };

  const handLabel = (hand: string | null) => hand === "left" ? "Canhoto" : "Destro";
  const posLabel = (pos: string | null) => {
    if (pos === "left") return "Esquerda";
    if (pos === "right") return "Direita";
    return "Ambos";
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header with gradient */}
      <header className="relative overflow-hidden bg-card px-5 pb-8 pt-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
        <div className="relative flex flex-col items-center">
          <div className="relative mb-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-24 w-24 rounded-full border-2 border-border object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-border bg-muted font-display text-3xl font-bold text-foreground">
                {displayName.charAt(0)}
              </div>
            )}
            <button className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground">
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <h1 className="font-display text-xl font-bold text-foreground">{displayName}</h1>
          {profile?.nickname && (
            <p className="text-sm text-muted-foreground">@{profile.nickname}</p>
          )}
          {profile?.instagram_handle && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <AtSign className="h-3 w-3" />
              {profile.instagram_handle}
            </p>
          )}
        </div>
      </header>

      <div className="space-y-4 px-5 pt-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Mão", value: handLabel(profile?.dominant_hand ?? null) },
            { label: "Posição", value: posLabel(profile?.preferred_position ?? null) },
            { label: "Golpe", value: shotLabel(profile?.killer_shot ?? null) },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center rounded-2xl border border-border bg-card p-3"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </span>
              <span className="mt-1 text-xs font-bold text-foreground">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Menu */}
        <div className="space-y-0.5 rounded-3xl border border-border bg-card p-1.5">
          {[
            { icon: Settings, label: "Editar Perfil" },
            { icon: Award, label: "Conquistas" },
            { icon: History, label: "Histórico" },
            { icon: Shield, label: "Privacidade" },
          ].map((item) => (
            <button
              key={item.label}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-accent"
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            </button>
          ))}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-destructive/20 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5"
        >
          <LogOut className="h-4 w-4" />
          Sair da conta
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
