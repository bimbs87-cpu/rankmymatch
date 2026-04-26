import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createGroup } from "@/hooks/use-groups";
import { useNavigate } from "@tanstack/react-router";
import { X, Globe, Lock, Users, UserRound, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { GroupImageUpload } from "@/components/GroupImageUpload";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
}

type MatchFormat = "doubles" | "singles";
type SinglesGroupType = "rivalry" | "league" | "casual";
type Step = "format" | "singles_type" | "form";

const SINGLES_SPORTS = [
  { value: "padel", label: "Padel" },
  { value: "tennis", label: "Tênis" },
  { value: "squash", label: "Squash" },
  { value: "pickleball", label: "Pickleball" },
];

const SINGLES_TYPE_OPTIONS: { value: SinglesGroupType; label: string; desc: string; emoji: string }[] = [
  { value: "rivalry", label: "Rivalidade", desc: "2 jogadores fixos · confronto direto histórico", emoji: "⚔️" },
  { value: "league", label: "Liga", desc: "Vários jogadores · ranking e rodadas", emoji: "🏆" },
  { value: "casual", label: "Casual", desc: "Partidas avulsas · histórico livre", emoji: "🎾" },
];

export function CreateGroupDialog({ open, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("format");
  const [matchFormat, setMatchFormat] = useState<MatchFormat>("doubles");
  const [singlesGroupType, setSinglesGroupType] = useState<SinglesGroupType>("league");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [sport, setSport] = useState("padel");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setStep("format");
    setMatchFormat("doubles");
    setSinglesGroupType("league");
    setName("");
    setDescription("");
    setIsPublic(true);
    setMaxPlayers(20);
    setSport("padel");
    setImageUrl(null);
  };

  const handleSelectFormat = (format: MatchFormat) => {
    setMatchFormat(format);
    if (format === "singles") {
      setStep("singles_type");
    } else {
      setSport("padel");
      setStep("form");
    }
  };

  const handleSelectSinglesType = (type: SinglesGroupType) => {
    setSinglesGroupType(type);
    if (type === "rivalry") {
      setMaxPlayers(2);
    } else {
      setMaxPlayers(20);
    }
    setStep("form");
  };

  const handleBack = () => {
    if (step === "form" && matchFormat === "singles") {
      setStep("singles_type");
    } else if (step === "singles_type") {
      setStep("format");
    } else {
      setStep("format");
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !user || submitting) return;

    setSubmitting(true);

    try {
      const group = await createGroup({
        name: name.trim(),
        description: description.trim(),
        is_public: isPublic,
        max_players: maxPlayers,
        sport,
        userId: user.id,
        match_format: matchFormat,
        singles_group_type: matchFormat === "singles" ? singlesGroupType : undefined,
      });

      if (imageUrl && group) {
        const { error: updateImageError } = await supabase
          .from("groups")
          .update({ image_url: imageUrl })
          .eq("id", group.id);

        if (updateImageError) throw updateImageError;
      }

      resetForm();
      onClose();
      toast.success("Grupo criado com sucesso!");
      void import("@/lib/analytics").then(({ trackConversion }) =>
        trackConversion("create_group", { sport, match_format: matchFormat, is_public: isPublic, group_id: group.id }),
      );
      void import("@/lib/onboarding-events").then(({ trackOnboardingStep }) =>
        trackOnboardingStep("created_first_group", { group_id: group.id, sport }),
      );
      navigate({ to: "/groups/$groupId", params: { groupId: group.id } });
    } catch (e: any) {
      console.error("Erro ao criar grupo:", e);
      toast.error(e?.message || "Erro ao criar grupo. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const stepTitle = step === "format"
    ? "Formato do Grupo"
    : step === "singles_type"
    ? "Tipo de Singles"
    : "Criar Grupo";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ touchAction: "none" }} onTouchMove={(e) => e.stopPropagation()}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative flex w-full max-w-lg flex-col rounded-3xl border border-border bg-card animate-in zoom-in-95 duration-300 max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
          <div className="flex items-center gap-2">
            {step !== "format" && (
              <button onClick={handleBack} disabled={submitting} className="rounded-full bg-muted p-1.5 disabled:opacity-50">
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <h2 className="font-display text-lg font-bold text-foreground">{stepTitle}</h2>
          </div>
          <button onClick={handleClose} disabled={submitting} className="rounded-full bg-muted p-2 disabled:opacity-50">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
          {step === "format" ? (
            <FormatSelection onSelect={handleSelectFormat} />
          ) : step === "singles_type" ? (
            <SinglesTypeSelection onSelect={handleSelectSinglesType} />
          ) : (
            <GroupForm
              matchFormat={matchFormat}
              singlesGroupType={singlesGroupType}
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              isPublic={isPublic}
              setIsPublic={setIsPublic}
              maxPlayers={maxPlayers}
              setMaxPlayers={setMaxPlayers}
              sport={sport}
              setSport={setSport}
              imageUrl={imageUrl}
              setImageUrl={setImageUrl}
              submitting={submitting}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FormatSelection({ onSelect }: { onSelect: (format: MatchFormat) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Selecione o formato de partida para o seu grupo:</p>

      <button
        onClick={() => onSelect("doubles")}
        className="flex w-full items-start gap-4 rounded-2xl border border-border bg-background p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]"
      >
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-sm font-bold text-foreground">Duplas (2x2)</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">4 jogadores por partida</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">Formato padrão de duplas em tênis, padel, beach tennis e pickleball</p>
        </div>
      </button>

      <button
        onClick={() => onSelect("singles")}
        className="flex w-full items-start gap-4 rounded-2xl border border-border bg-background p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]"
      >
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accent/30">
          <UserRound className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-sm font-bold text-foreground">Singles (1x1)</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">2 jogadores por confronto</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">Tênis, padel singles, squash, pickleball</p>
        </div>
      </button>
    </div>
  );
}

function SinglesTypeSelection({ onSelect }: { onSelect: (type: SinglesGroupType) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Qual o formato do grupo Singles?</p>
      {SINGLES_TYPE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value)}
          className="flex w-full items-start gap-4 rounded-2xl border border-border bg-background p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl">
            {opt.emoji}
          </div>
          <div>
            <h3 className="font-display text-sm font-bold text-foreground">{opt.label}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

interface GroupFormProps {
  matchFormat: MatchFormat;
  singlesGroupType: SinglesGroupType;
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  isPublic: boolean;
  setIsPublic: (v: boolean) => void;
  maxPlayers: number;
  setMaxPlayers: (v: number) => void;
  sport: string;
  setSport: (v: string) => void;
  imageUrl: string | null;
  setImageUrl: (v: string | null) => void;
  submitting: boolean;
  onSubmit: () => void;
}

function GroupForm({
  matchFormat,
  singlesGroupType,
  name, setName,
  description, setDescription,
  isPublic, setIsPublic,
  maxPlayers, setMaxPlayers,
  sport, setSport,
  imageUrl, setImageUrl,
  submitting,
  onSubmit,
}: GroupFormProps) {
  const isSingles = matchFormat === "singles";
  const formatLabel = isSingles ? "Singles (1x1)" : "Duplas (2x2)";
  const typeLabel = isSingles
    ? singlesGroupType === "rivalry" ? "Rivalidade" : singlesGroupType === "league" ? "Liga" : "Casual"
    : null;

  return (
    <div className="space-y-4">
      {/* Format badge */}
      <div className="flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2">
        {isSingles ? (
          <UserRound className="h-4 w-4 text-primary" />
        ) : (
          <Users className="h-4 w-4 text-primary" />
        )}
        <span className="text-xs font-semibold text-primary">{formatLabel}</span>
        {typeLabel && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{typeLabel}</span>
        )}
      </div>

      {/* Imagem */}
      <GroupImageUpload
        onUploaded={(url) => setImageUrl(url)}
        onRemoved={() => setImageUrl(null)}
      />

      {/* Nome */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome do grupo *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isSingles ? "Ex: Rivalidade Padel" : "Ex: Elite Padel Club"}
          maxLength={60}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Descrição */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Descrição</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Conte um pouco sobre o grupo..."
          maxLength={300}
          rows={2}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      {/* Sport (only for singles) */}
      {isSingles && (
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">Esporte</label>
          <div className="grid grid-cols-2 gap-2">
            {SINGLES_SPORTS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSport(s.value)}
                className={`rounded-2xl border p-2.5 text-sm font-medium transition-colors ${
                  sport === s.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Visibilidade */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Visibilidade</label>
        <div className="flex gap-2">
          <button
            onClick={() => setIsPublic(true)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${
              isPublic
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground"
            }`}
          >
            <Globe className="h-4 w-4" />
            Público
          </button>
          <button
            onClick={() => setIsPublic(false)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${
              !isPublic
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground"
            }`}
          >
            <Lock className="h-4 w-4" />
            Privado
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {isPublic ? "Qualquer um pode encontrar e entrar." : "Entrada somente por convite ou aprovação."}
        </p>
      </div>

      {/* Max Players — hide for rivalry */}
      {!(isSingles && singlesGroupType === "rivalry") && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            <Users className="mr-1 inline h-3.5 w-3.5" />
            Máximo de membros
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={isSingles ? 2 : 4}
              max={100}
              step={isSingles ? 1 : 2}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="w-10 text-center font-display text-lg font-bold text-foreground">{maxPlayers}</span>
          </div>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!name.trim() || submitting}
        className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
      >
        {submitting ? "Criando..." : "Criar Grupo"}
      </button>
    </div>
  );
}
