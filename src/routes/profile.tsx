import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { supabase } from "@/integrations/supabase/client";
import { AvatarPickerDialog } from "@/components/AvatarPickerDialog";
import { ProfileBody } from "@/components/ProfileBody";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import {
  loadAggregatedProfile,
  loadAggregatedSummary,
  loadEloHistory,
  type AggregatedProfile,
  type AggregatedSummary,
} from "@/lib/aggregated-profile";
import { useEffect, useState } from "react";
import { useInstallFlow } from "@/components/InstallFlowProvider";
import { toast } from "sonner";
import {
  LogOut,
  ChevronRight,
  Settings,
  Award,
  History,
  Camera,
  ArrowLeft,
  Save,
  Sun,
  Moon,
  Monitor,
  Download,
  Bell,
  Eye,
  EyeOff,
  Sparkles,
  X as XIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useTheme } from "@/lib/theme";
import { DEFAULT_PRIVACY, parsePrivacy, type PrivacySettings } from "@/components/PlayerProfileViewer";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

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

type AccentKey = "emerald" | "amber" | "sky" | "rose" | "violet" | "slate";
const ACCENT_OPTIONS: { key: AccentKey; label: string; cls: string }[] = [
  { key: "emerald", label: "Neon", cls: "bg-[#a3ff12]" },
  { key: "amber", label: "Âmbar", cls: "bg-[#fbbf24]" },
  { key: "sky", label: "Céu", cls: "bg-[#38bdf8]" },
  { key: "rose", label: "Rosa", cls: "bg-[#fb7185]" },
  { key: "violet", label: "Violeta", cls: "bg-[#a78bfa]" },
  { key: "slate", label: "Ardósia", cls: "bg-[#94a3b8]" },
];

function ProfilePage() {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AggregatedProfile | null>(null);
  const [summary, setSummary] = useState<AggregatedSummary | null>(null);
  const [eloHistory, setEloHistory] = useState<{ date: string; rating: number }[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [editing, setEditing] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const { theme, cycleTheme, resolved } = useTheme();
  const { canInstall, isInstalled, isIos, startInstall } = useInstallFlow();

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editNickname, setEditNickname] = useState("");
  const [editHand, setEditHand] = useState("right");
  const [editPosition, setEditPosition] = useState("both");
  const [editKillerShot, setEditKillerShot] = useState("none");
  const [editWorstShot, setEditWorstShot] = useState("none");
  const [editInstagram, setEditInstagram] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [editAccent, setEditAccent] = useState<AccentKey | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY);

  useEffect(() => {
    if (!isAuthenticated && !isLoading) navigate({ to: "/login" });
  }, [isAuthenticated, isLoading, navigate]);

  const reload = async () => {
    if (!user) return;
    setLoadingProfile(true);
    const [p, s, h] = await Promise.all([
      loadAggregatedProfile(user.id),
      loadAggregatedSummary(user.id),
      loadEloHistory(user.id),
    ]);
    if (p) {
      setProfile(p);
      setPrivacy(p.privacy);
    }
    setSummary(s);
    setEloHistory(h);
    setLoadingProfile(false);
  };

  useEffect(() => {
    if (!user) {
      setLoadingProfile(false);
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openEdit = async () => {
    if (!profile) return;
    setEditName(profile.name || "");
    setEditNickname(profile.nickname || "");
    setEditHand(profile.dominant_hand || "right");
    setEditPosition(profile.preferred_position || "both");
    setEditKillerShot(profile.killer_shot || "none");
    setEditWorstShot(profile.worst_shot || "none");
    setEditInstagram(profile.instagram_handle || "");
    // Tagline isn't on AggregatedProfile — fetch it directly.
    if (user) {
      const { data } = await supabase
        .from("user_profiles")
        .select("share_tagline, share_accent_color")
        .eq("user_id", user.id)
        .maybeSingle();
      setEditTagline(data?.share_tagline || "");
      const acc = (data as { share_accent_color?: string | null } | null)?.share_accent_color;
      setEditAccent(
        acc && ACCENT_OPTIONS.some((o) => o.key === acc) ? (acc as AccentKey) : null,
      );
    } else {
      setEditTagline("");
      setEditAccent(null);
    }
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
        share_tagline: editTagline.trim().slice(0, 60) || null,
        share_accent_color: editAccent,
      } as never)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Erro ao salvar perfil");
    } else {
      toast.success("Perfil atualizado!");
      setEditing(false);
      await reload();
    }
    setSaving(false);
  };

  const updatePrivacy = async (next: PrivacySettings) => {
    if (!user) return;
    setPrivacy(next);
    const { error } = await supabase
      .from("user_profiles")
      .update({ privacy_settings: next as unknown as Record<string, boolean> })
      .eq("user_id", user.id);
    if (error) toast.error("Erro ao salvar privacidade");
    else {
      setProfile((prev) => (prev ? { ...prev, privacy: next } : prev));
      toast.success("Privacidade atualizada");
    }
  };

  if (isLoading || loadingProfile) return <TrophyLoadingBar />;

  const googlePhotoUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const avatarUrl = profile?.avatar_url || googlePhotoUrl;

  const handleAvatarSelect = async (url: string, type: "google" | "emoji") => {
    if (!user) return;
    setSavingAvatar(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ avatar_url: url, avatar_type: type === "google" ? "google" : "preset" })
      .eq("user_id", user.id);
    if (error) {
      toast.error("Erro ao salvar avatar");
    } else {
      setProfile((prev) => (prev ? { ...prev, avatar_url: url } : prev));
      toast.success("Avatar atualizado!");
      setAvatarPickerOpen(false);
    }
    setSavingAvatar(false);
  };

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  // Edit mode
  if (editing && profile) {
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
          <Field label="Nome *">
            <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={100}
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none" />
          </Field>
          <Field label="Apelido">
            <input value={editNickname} onChange={(e) => setEditNickname(e.target.value)} maxLength={50}
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none" />
          </Field>
          <Field label="Instagram">
            <div className="flex items-center rounded-2xl border border-border bg-card">
              <span className="pl-4 text-sm text-muted-foreground">@</span>
              <input value={editInstagram} onChange={(e) => setEditInstagram(e.target.value.replace(/[^a-zA-Z0-9._]/g, ""))} maxLength={30}
                className="w-full bg-transparent px-2 py-3 text-sm text-foreground focus:outline-none" placeholder="seu_usuario" />
            </div>
          </Field>
          <Field label="Mão dominante">
            <div className="flex gap-2">
              {HAND_OPTIONS.map((o) => (
                <ToggleBtn key={o.value} active={editHand === o.value} onClick={() => setEditHand(o.value)}>{o.label}</ToggleBtn>
              ))}
            </div>
          </Field>
          <Field label="Frase no card de compartilhamento">
            <input
              value={editTagline}
              onChange={(e) => setEditTagline(e.target.value.slice(0, 60))}
              maxLength={60}
              placeholder="Ex: Vamos jogar?"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Aparece como subtítulo no card que vai pro WhatsApp/Instagram. {editTagline.length}/60
            </p>
          </Field>
          <Field label="Cor de destaque do badge">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditAccent(null)}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${editAccent === null ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}
              >
                Padrão
              </button>
              {ACCENT_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setEditAccent(o.key)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${editAccent === o.key ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/40" : "border-border bg-card text-muted-foreground"}`}
                  aria-label={`Cor ${o.label}`}
                >
                  <span className={`h-3.5 w-3.5 rounded-full ${o.cls}`} />
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            <Sparkles className="h-4 w-4" />
            Pré-visualizar card de compartilhamento
          </button>
          <Field label="Posição preferida">
            <div className="flex gap-2">
              {POSITION_OPTIONS.map((o) => (
                <ToggleBtn key={o.value} active={editPosition === o.value} onClick={() => setEditPosition(o.value)}>{o.label}</ToggleBtn>
              ))}
            </div>
          </Field>
          <Field label="Golpe matador 💥">
            <div className="flex flex-wrap gap-2">
              {SHOT_OPTIONS.map((o) => (
                <Pill key={o.value} active={editKillerShot === o.value} onClick={() => setEditKillerShot(o.value)}>{o.label}</Pill>
              ))}
            </div>
          </Field>
          <Field label="Ponto fraco 😅">
            <div className="flex flex-wrap gap-2">
              {SHOT_OPTIONS.map((o) => (
                <Pill key={o.value} active={editWorstShot === o.value} onClick={() => setEditWorstShot(o.value)} tone="destructive">{o.label}</Pill>
              ))}
            </div>
          </Field>
          <button onClick={handleSave} disabled={saving || !editName.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            <Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    );
  }

  if (!profile || !summary) return <TrophyLoadingBar />;

  // Privacy panel
  if (privacyOpen) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <header className="flex items-center gap-3 px-5 pt-6 pb-4">
          <button onClick={() => setPrivacyOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card">
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </button>
          <h1 className="flex-1 font-display text-lg font-bold text-foreground">Privacidade do perfil</h1>
        </header>
        <div className="space-y-3 px-5">
          <p className="text-xs text-muted-foreground">
            Outros jogadores sempre verão seu Elo, posição no ranking, melhor colocação e forma atual.
            Você pode ocultar os blocos abaixo.
          </p>
          <PrivacyToggle
            label="Dados pessoais"
            desc="Mão, posição, golpes e Instagram"
            value={privacy.show_personal}
            onChange={(v) => updatePrivacy({ ...privacy, show_personal: v })}
          />
          <PrivacyToggle
            label="Estatísticas detalhadas + gráfico de evolução"
            desc="Partidas, sets, streak, curva de Elo"
            value={privacy.show_stats}
            onChange={(v) => updatePrivacy({ ...privacy, show_stats: v })}
          />
          <PrivacyToggle
            label="Grupos e rivalidades"
            desc="Lista de grupos, rival e vítima preferida"
            value={privacy.show_groups}
            onChange={(v) => updatePrivacy({ ...privacy, show_groups: v })}
          />
          <PrivacyToggle
            label="Conquistas e medalhas"
            desc="Trofeus de temporadas e badges"
            value={privacy.show_achievements}
            onChange={(v) => updatePrivacy({ ...privacy, show_achievements: v })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <ProfileBody
        profile={{ ...profile, avatar_url: avatarUrl }}
        summary={summary}
        eloHistory={eloHistory}
        isSelfView
        topRightActions={
          <ShareProfileButton userId={user!.id} playerName={profile.name || "meu perfil"} />
        }
        heroActions={
          <button
            onClick={() => setAvatarPickerOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground"
            aria-label="Trocar avatar"
          >
            <Camera className="h-4 w-4" />
          </button>
        }
        footer={
          <div className="space-y-0.5 rounded-3xl border border-border bg-card p-1.5">
            <MenuItem icon={<Settings className="h-4 w-4 text-muted-foreground" />} label="Editar Perfil" onClick={openEdit} />
            <MenuItem icon={<Eye className="h-4 w-4 text-muted-foreground" />} label="Privacidade" onClick={() => setPrivacyOpen(true)} />
            <MenuItem icon={<Award className="h-4 w-4 text-muted-foreground" />} label="Conquistas" onClick={() => toast.info("Em breve!")} />
            <MenuItemLink to="/history" icon={<History className="h-4 w-4 text-muted-foreground" />} label="Histórico" />
            <MenuItemLink to="/notifications" icon={<Bell className="h-4 w-4 text-muted-foreground" />} label="Notificações" />
            <MenuItem
              icon={resolved === "dark" ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
              label="Tema"
              right={<span className="text-xs text-muted-foreground">{theme === "system" ? "Sistema" : theme === "dark" ? "Escuro" : "Claro"}</span>}
              onClick={cycleTheme}
            />
            {canInstall && !isInstalled ? (
              <MenuItem icon={<Download className="h-4 w-4 text-muted-foreground" />} label={isIos ? "Instalar (iOS)" : "Instalar app"} onClick={startInstall} />
            ) : null}
            <button onClick={handleLogout} className="mt-2 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-destructive transition-colors hover:bg-destructive/10">
              <LogOut className="h-4 w-4" />
              <span className="flex-1 text-sm font-medium">Sair da conta</span>
            </button>
          </div>
        }
      />

      <AvatarPickerDialog
        open={avatarPickerOpen}
        onOpenChange={(v) => setAvatarPickerOpen(v)}
        onSelect={handleAvatarSelect}
        currentAvatarUrl={profile.avatar_url}
        googlePhotoUrl={googlePhotoUrl}
        saving={savingAvatar}
      />
    </div>
  );
}

// ---- atoms ----
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex-1 rounded-2xl border py-3 text-sm font-semibold transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>
      {children}
    </button>
  );
}
function Pill({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "destructive" }) {
  const activeCls = tone === "destructive" ? "border-destructive/80 bg-destructive/10 text-destructive" : "border-primary bg-primary/10 text-primary";
  return (
    <button onClick={onClick} className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${active ? activeCls : "border-border bg-card text-muted-foreground"}`}>
      {children}
    </button>
  );
}
function MenuItem({ icon, label, onClick, right }: { icon: React.ReactNode; label: string; onClick: () => void; right?: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-accent">
      {icon}
      <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
      {right ?? <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
    </button>
  );
}
function MenuItemLink({ to, icon, label }: { to: "/history" | "/notifications"; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-accent">
      {icon}
      <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
    </Link>
  );
}
function PrivacyToggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex w-full items-center gap-3 rounded-3xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent">
      {value ? <Eye className="h-5 w-5 text-primary" /> : <EyeOff className="h-5 w-5 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-muted"}`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}
