import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import {
  LogOut,
  ChevronRight,
  Settings,
  Award,
  History,
  Shield,
  Camera,
  Instagram,
} from "lucide-react";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

const SHOTS = [
  "none", "smash", "voleio drive", "voleio revés", "fundo drive",
  "fundo revés", "parede", "víbora", "bandeja", "curtinha", "saque", "lob",
];

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

  const handLabel = (hand: string | null) => {
    if (hand === "left") return "Canhoto";
    return "Destro";
  };

  const posLabel = (pos: string | null) => {
    if (pos === "left") return "Esquerda";
    if (pos === "right") return "Direita";
    return "Ambos";
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/80 px-4 pb-8 pt-12">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white" />
          <div className="absolute -left-5 bottom-0 h-24 w-24 rounded-full bg-white" />
        </div>
        <div className="relative flex flex-col items-center">
          <div className="relative mb-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-24 w-24 rounded-full border-4 border-white/20 object-cover shadow-xl"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/20 bg-white/20 text-3xl font-bold text-white shadow-xl">
                {displayName.charAt(0)}
              </div>
            )}
            <button className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-card text-foreground shadow-md">
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <h1 className="text-xl font-bold text-white">{displayName}</h1>
          {profile?.nickname && (
            <p className="text-sm text-white/70">@{profile.nickname}</p>
          )}
          {profile?.instagram_handle && (
            <p className="mt-1 flex items-center gap-1 text-xs text-white/60">
              <Instagram className="h-3 w-3" />
              {profile.instagram_handle}
            </p>
          )}
        </div>
      </header>

      <div className="space-y-4 px-4 pt-5">
        {/* Stats cards */}
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
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </span>
              <span className="mt-1 text-xs font-semibold text-foreground">
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        {/* Menu items */}
        <div className="space-y-1 rounded-2xl border border-border bg-card p-1">
          {[
            { icon: Settings, label: "Editar Perfil", to: "/profile" },
            { icon: Award, label: "Conquistas", to: "/profile" },
            { icon: History, label: "Histórico", to: "/profile" },
            { icon: Shield, label: "Privacidade", to: "/profile" },
          ].map((item) => (
            <button
              key={item.label}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent"
            >
              <item.icon className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium text-foreground">
                {item.label}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        {/* Logout */}
        <Button
          variant="outline"
          onClick={handleLogout}
          className="w-full gap-2 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive/5"
        >
          <LogOut className="h-4 w-4" />
          Sair da conta
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}
