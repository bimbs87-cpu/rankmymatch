import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { EloChart } from "@/components/EloChart";
import { AvatarPickerDialog } from "@/components/AvatarPickerDialog";
import { useEffect, useState } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { toast } from "sonner";
import {
  LogOut,
  ChevronRight,
  Settings,
  Award,
  History,
  Shield,
  Camera,
  AtSign,
  ArrowLeft,
  Save,
  X,
  Sun,
  Moon,
  Monitor,
  Download,
  Share,
} from "lucide-react";
import { useTheme } from "@/lib/theme";

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

const HAND_OPTIONS = [
  { value: "right", label: "Destro" },
  { value: "left", label: "Canhoto" },
];

const POSITION_OPTIONS = [
  { value: "both", label: "Ambos" },
  { value: "left", label: "Esquerda" },
  { value: "right", label: "Direita" },
];

const SHOT_OPTIONS = [
  { value: "none", label: "Nenhum" },
  { value: "bandeja", label: "Bandeja" },
  { value: "vibora", label: "Víbora" },
  { value: "smash", label: "Smash" },
  { value: "lob", label: "Lob" },
  { value: "chiquita", label: "Chiquita" },
  { value: "rulo", label: "Rulo" },
  { value: "bajada", label: "Bajada" },
  { value: "gancho", label: "Gancho" },
];

function ProfilePage() {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const { theme, cycleTheme, resolved } = useTheme();
  const { canInstall, isInstalled, isIos, install } = usePwaInstall();

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editNickname, setEditNickname] = useState("");
  const [editHand, setEditHand] = useState("right");
  const [editPosition, setEditPosition] = useState("both");
  const [editKillerShot, setEditKillerShot] = useState("none");
  const [editWorstShot, setEditWorstShot] = useState("none");
  const [editInstagram, setEditInstagram] = useState("");

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      navigate({ to: "/login" });
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    if (!user) {
      setLoadingProfile(false);
      return;
    }
    const load = async () => {
      try {
        const { data } = await supabase
          .from("user_profiles")
          .select("name, nickname, avatar_url, dominant_hand, preferred_position, killer_shot, worst_shot, instagram_handle")
          .eq("user_id", user.id)
          .single();
        if (data) setProfile(data as Profile);
      } finally {
        setLoadingProfile(false);
      }
    };
    load();
  }, [user]);

  const openEdit = () => {
    if (!profile) return;
    setEditName(profile.name || "");
    setEditNickname(profile.nickname || "");
    setEditHand(profile.dominant_hand || "right");
    setEditPosition(profile.preferred_position || "both");
    setEditKillerShot(profile.killer_shot || "none");
    setEditWorstShot(profile.worst_shot || "none");
    setEditInstagram(profile.instagram_handle || "");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      toast.error("Nome não pode estar vazio");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({
        name: trimmedName.slice(0, 100),
        nickname: editNickname.trim().slice(0, 50) || null,
        dominant_hand: editHand,
        preferred_position: editPosition,
        killer_shot: editKillerShot,
        worst_shot: editWorstShot,
        instagram_handle: editInstagram.trim().replace(/^@/, "").slice(0, 30) || null,
      })
      .eq("user_id", user.id);

    if (error) {
      toast.error("Erro ao salvar perfil");
    } else {
      // Refresh profile
      const { data } = await supabase
        .from("user_profiles")
        .select("name, nickname, avatar_url, dominant_hand, preferred_position, killer_shot, worst_shot, instagram_handle")
        .eq("user_id", user.id)
        .single();
      if (data) setProfile(data as Profile);
      toast.success("Perfil atualizado!");
      setEditing(false);
    }
    setSaving(false);
  };

  if (isLoading || loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  const handleAvatarSelect = async (url: string) => {
    if (!user) return;
    setSavingAvatar(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ avatar_url: url, avatar_type: "premium" })
      .eq("user_id", user.id);
    if (error) {
      toast.error("Erro ao salvar avatar");
    } else {
      setProfile((prev) => prev ? { ...prev, avatar_url: url } : prev);
      toast.success("Avatar atualizado!");
      setAvatarPickerOpen(false);
    }
    setSavingAvatar(false);
  };
  const displayName = profile?.name || user?.user_metadata?.full_name || "Jogador";

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const shotLabel = (shot: string | null) => {
    if (!shot || shot === "none") return "Nenhum";
    const found = SHOT_OPTIONS.find((o) => o.value === shot);
    return found?.label || shot.charAt(0).toUpperCase() + shot.slice(1);
  };

  const handLabel = (hand: string | null) => hand === "left" ? "Canhoto" : "Destro";
  const posLabel = (pos: string | null) => {
    if (pos === "left") return "Esquerda";
    if (pos === "right") return "Direita";
    return "Ambos";
  };

  // Edit mode
  if (editing) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <header className="flex items-center gap-3 px-5 pt-6 pb-4">
          <button
            onClick={() => setEditing(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </button>
          <h1 className="flex-1 font-display text-lg font-bold text-foreground">Editar Perfil</h1>
        </header>

        <div className="space-y-5 px-5">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nome *
            </label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={100}
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              placeholder="Seu nome"
            />
          </div>

          {/* Nickname */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Apelido
            </label>
            <input
              value={editNickname}
              onChange={(e) => setEditNickname(e.target.value)}
              maxLength={50}
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              placeholder="Como querem te chamar?"
            />
          </div>

          {/* Instagram */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Instagram
            </label>
            <div className="flex items-center rounded-2xl border border-border bg-card">
              <span className="pl-4 text-sm text-muted-foreground">@</span>
              <input
                value={editInstagram}
                onChange={(e) => setEditInstagram(e.target.value.replace(/[^a-zA-Z0-9._]/g, ""))}
                maxLength={30}
                className="w-full bg-transparent px-2 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                placeholder="seu_usuario"
              />
            </div>
          </div>

          {/* Dominant Hand */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Mão dominante
            </label>
            <div className="flex gap-2">
              {HAND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEditHand(opt.value)}
                  className={`flex-1 rounded-2xl border py-3 text-sm font-semibold transition-colors ${
                    editHand === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Position */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Posição preferida
            </label>
            <div className="flex gap-2">
              {POSITION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEditPosition(opt.value)}
                  className={`flex-1 rounded-2xl border py-3 text-xs font-semibold transition-colors ${
                    editPosition === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Killer Shot */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Golpe matador 💥
            </label>
            <div className="flex flex-wrap gap-2">
              {SHOT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEditKillerShot(opt.value)}
                  className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
                    editKillerShot === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Worst Shot */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ponto fraco 😅
            </label>
            <div className="flex flex-wrap gap-2">
              {SHOT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEditWorstShot(opt.value)}
                  className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
                    editWorstShot === opt.value
                      ? "border-destructive/80 bg-destructive/10 text-destructive"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || !editName.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    );
  }

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
            <button
              onClick={() => setAvatarPickerOpen(true)}
              className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground"
            >
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
        {/* Elo Evolution Chart */}
        {user && <EloChart userId={user.id} />}

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
          <button
            onClick={openEdit}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-accent"
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium text-foreground">Editar Perfil</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </button>
          <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-accent">
            <Award className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium text-foreground">Conquistas</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </button>
          <Link
            to="/history"
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-accent"
          >
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium text-foreground">Histórico</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </Link>
          <button
            onClick={cycleTheme}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-accent"
          >
            {resolved === "dark" ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
            <span className="flex-1 text-sm font-medium text-foreground">Tema</span>
            <span className="text-xs text-muted-foreground mr-1">
              {theme === "dark" ? "Escuro" : theme === "light" ? "Claro" : "Sistema"}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </button>
          <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-accent">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium text-foreground">Privacidade</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </button>
          {!isInstalled && (canInstall || isIos) && (
            <button
              onClick={canInstall ? install : undefined}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-accent"
            >
              <Download className="h-4 w-4 text-primary" />
              <span className="flex-1 text-sm font-medium text-foreground">
                {isIos ? "Instalar App" : "Instalar App"}
              </span>
              {isIos ? (
                <span className="text-[10px] text-muted-foreground mr-1">
                  Use <Share className="inline h-3 w-3" /> Compartilhar
                </span>
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              )}
            </button>
          )}
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

      <AvatarPickerDialog
        open={avatarPickerOpen}
        onOpenChange={setAvatarPickerOpen}
        currentAvatarUrl={profile?.avatar_url || null}
        onSelect={handleAvatarSelect}
        saving={savingAvatar}
      />
    </div>
  );
}
