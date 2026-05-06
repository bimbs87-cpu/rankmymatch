import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Users, User, Calendar, MapPin, Search, Check } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
}

interface Contact {
  id: string;
  display_name: string;
  nickname: string | null;
  linked_user_id: string | null;
}

interface Slot {
  // Either a saved contact, an app user (linked), or just a free name
  contactId: string | null;
  linkedUserId: string | null;
  name: string;
}

interface SetRow {
  a: string;
  b: string;
}

const emptySlot = (): Slot => ({ contactId: null, linkedUserId: null, name: "" });

export function CasualMatchDialog({ open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const { displayName } = useUserProfile();
  const [format, setFormat] = useState<"singles" | "doubles">("doubles");
  const [playedOn, setPlayedOn] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  // Team A: index 0 is the owner (you). For doubles, index 1 is partner.
  const [teamA, setTeamA] = useState<Slot[]>([emptySlot(), emptySlot()]);
  const [teamB, setTeamB] = useState<Slot[]>([emptySlot(), emptySlot()]);
  const [sets, setSets] = useState<SetRow[]>([{ a: "", b: "" }]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    supabase
      .from("personal_contacts")
      .select("id, display_name, nickname, linked_user_id")
      .eq("owner_user_id", user.id)
      .order("display_name")
      .then(({ data }) => setContacts((data as Contact[]) || []));
  }, [open, user]);

  // Reset form when opening
  useEffect(() => {
    if (open) {
      setFormat("doubles");
      setPlayedOn(new Date().toISOString().slice(0, 10));
      setLocation("");
      setTeamA([emptySlot(), emptySlot()]);
      setTeamB([emptySlot(), emptySlot()]);
      setSets([{ a: "", b: "" }]);
    }
  }, [open]);

  const slotsPerTeam = format === "singles" ? 1 : 2;

  const winner = useMemo(() => {
    let a = 0, b = 0;
    for (const s of sets) {
      const av = parseInt(s.a, 10);
      const bv = parseInt(s.b, 10);
      if (Number.isNaN(av) || Number.isNaN(bv)) continue;
      if (av > bv) a++;
      else if (bv > av) b++;
    }
    if (a === 0 && b === 0) return null;
    return a > b ? "a" : b > a ? "b" : null;
  }, [sets]);

  const updateSlot = (team: "a" | "b", idx: number, patch: Partial<Slot>) => {
    const setter = team === "a" ? setTeamA : setTeamB;
    setter((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const handleSave = async () => {
    if (!user) return;
    // Validate slots (excluding owner slot 0 of teamA which is auto)
    const collect = (team: Slot[], n: number, isOwnerTeamA: boolean) => {
      const arr: Slot[] = [];
      for (let i = 0; i < n; i++) {
        if (isOwnerTeamA && i === 0) {
          arr.push({ contactId: null, linkedUserId: user.id, name: displayName || "Você" });
        } else {
          const s = team[i];
          if (!s.name.trim()) throw new Error("Preencha todos os nomes dos jogadores");
          arr.push(s);
        }
      }
      return arr;
    };

    let aSlots: Slot[];
    let bSlots: Slot[];
    try {
      aSlots = collect(teamA, slotsPerTeam, true);
      bSlots = collect(teamB, slotsPerTeam, false);
    } catch (e: any) {
      toast.error(e.message);
      return;
    }
    const validSets = sets.filter((s) => s.a !== "" && s.b !== "");
    if (validSets.length === 0) {
      toast.error("Adicione ao menos 1 set com pontuação");
      return;
    }

    setSaving(true);
    try {
      // Auto-create personal_contacts for free names without contactId/linkedUserId
      const ensureContact = async (s: Slot): Promise<Slot> => {
        if (s.contactId || s.linkedUserId) return s;
        const trimmed = s.name.trim();
        // dedupe by case-insensitive name
        const existing = contacts.find((c) => c.display_name.toLowerCase() === trimmed.toLowerCase());
        if (existing) return { ...s, contactId: existing.id };
        const { data, error } = await supabase
          .from("personal_contacts")
          .insert({ owner_user_id: user.id, display_name: trimmed })
          .select("id, display_name, nickname, linked_user_id")
          .single();
        if (error) throw error;
        setContacts((prev) => [...prev, data as Contact]);
        return { ...s, contactId: data.id };
      };

      for (let i = 0; i < aSlots.length; i++) aSlots[i] = await ensureContact(aSlots[i]);
      for (let i = 0; i < bSlots.length; i++) bSlots[i] = await ensureContact(bSlots[i]);

      const { data: match, error: mErr } = await supabase
        .from("casual_matches")
        .insert({
          owner_user_id: user.id,
          match_format: format,
          played_on: playedOn,
          location: location.trim() || null,
          winner_team: winner,
        })
        .select("id")
        .single();
      if (mErr) throw mErr;

      const participants = [
        ...aSlots.map((s, i) => ({
          match_id: match.id,
          team: "a",
          contact_id: s.contactId,
          linked_user_id: s.linkedUserId,
          display_name: s.name.trim(),
          is_owner: i === 0,
        })),
        ...bSlots.map((s) => ({
          match_id: match.id,
          team: "b",
          contact_id: s.contactId,
          linked_user_id: s.linkedUserId,
          display_name: s.name.trim(),
          is_owner: false,
        })),
      ];
      const { error: pErr } = await supabase.from("casual_match_participants").insert(participants);
      if (pErr) throw pErr;

      const setRows = validSets.map((s, i) => ({
        match_id: match.id,
        set_number: i + 1,
        score_team_a: parseInt(s.a, 10) || 0,
        score_team_b: parseInt(s.b, 10) || 0,
      }));
      const { error: sErr } = await supabase.from("casual_match_sets").insert(setRows);
      if (sErr) throw sErr;

      toast.success("Partida registrada!");
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle>Registrar partida avulsa</DialogTitle>
          <DialogDescription className="text-xs">
            Para jogos-treino fora dos seus grupos. Não conta para Elo, mas vira estatística sua.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormat("singles")}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition ${
                format === "singles" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
              }`}
            >
              <User className="h-4 w-4" /> 1x1
            </button>
            <button
              type="button"
              onClick={() => setFormat("doubles")}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition ${
                format === "doubles" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
              }`}
            >
              <Users className="h-4 w-4" /> 2x2
            </button>
          </div>

          {/* Date + Location */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <Calendar className="h-3 w-3" /> Data
              </span>
              <input
                type="date"
                value={playedOn}
                onChange={(e) => setPlayedOn(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <MapPin className="h-3 w-3" /> Local
              </span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          {/* Teams */}
          <div className="space-y-3">
            <TeamEditor
              label="Seu time"
              accent="primary"
              slots={teamA}
              setSlot={(idx, patch) => updateSlot("a", idx, patch)}
              n={slotsPerTeam}
              ownerName={displayName || "Você"}
              isOwnerTeam
              contacts={contacts}
            />
            <div className="text-center text-xs font-bold text-muted-foreground">VS</div>
            <TeamEditor
              label="Adversários"
              accent="destructive"
              slots={teamB}
              setSlot={(idx, patch) => updateSlot("b", idx, patch)}
              n={slotsPerTeam}
              contacts={contacts}
            />
          </div>

          {/* Sets */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Sets
              </span>
              <button
                type="button"
                onClick={() => setSets((s) => [...s, { a: "", b: "" }])}
                className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary"
              >
                <Plus className="h-3 w-3" /> Set
              </button>
            </div>
            <div className="space-y-2">
              {sets.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-12 text-xs text-muted-foreground">Set {i + 1}</span>
                  <input
                    type="number"
                    min={0}
                    value={s.a}
                    onChange={(e) =>
                      setSets((prev) => prev.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))
                    }
                    className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm"
                  />
                  <span className="text-muted-foreground">×</span>
                  <input
                    type="number"
                    min={0}
                    value={s.b}
                    onChange={(e) =>
                      setSets((prev) => prev.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))
                    }
                    className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm"
                  />
                  {sets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSets((prev) => prev.filter((_, j) => j !== i))}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {winner && (
              <p className="mt-2 text-[11px] font-semibold text-success">
                <Check className="mr-1 inline h-3 w-3" />
                Vencedor: {winner === "a" ? "Seu time" : "Adversários"}
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar partida
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeamEditor({
  label,
  accent,
  slots,
  setSlot,
  n,
  ownerName,
  isOwnerTeam,
  contacts,
}: {
  label: string;
  accent: "primary" | "destructive";
  slots: Slot[];
  setSlot: (idx: number, patch: Partial<Slot>) => void;
  n: number;
  ownerName?: string;
  isOwnerTeam?: boolean;
  contacts: Contact[];
}) {
  return (
    <div className={`rounded-xl border p-3 ${accent === "primary" ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
      <p className={`mb-2 text-[10px] font-bold uppercase tracking-wider ${accent === "primary" ? "text-primary" : "text-destructive"}`}>
        {label}
      </p>
      <div className="space-y-2">
        {Array.from({ length: n }).map((_, i) => {
          if (isOwnerTeam && i === 0) {
            return (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2 text-sm">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">EU</div>
                <span className="font-semibold">{ownerName}</span>
              </div>
            );
          }
          return (
            <ContactPicker
              key={i}
              value={slots[i]}
              onChange={(patch) => setSlot(i, patch)}
              contacts={contacts}
              placeholder={isOwnerTeam ? "Nome do parceiro" : `Adversário ${i + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function ContactPicker({
  value,
  onChange,
  contacts,
  placeholder,
}: {
  value: Slot;
  onChange: (patch: Partial<Slot>) => void;
  contacts: Contact[];
  placeholder: string;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const filtered = useMemo(() => {
    const q = value.name.trim().toLowerCase();
    if (!q) return contacts.slice(0, 5);
    return contacts.filter((c) => c.display_name.toLowerCase().includes(q)).slice(0, 5);
  }, [value.name, contacts]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value, contactId: null, linkedUserId: null })}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={placeholder}
          className="flex-1 bg-transparent py-2 text-sm outline-none"
        />
        {value.contactId && <Check className="h-3.5 w-3.5 text-success" />}
      </div>
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {filtered.map((c) => (
            <button
              type="button"
              key={c.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange({ name: c.display_name, contactId: c.id, linkedUserId: c.linked_user_id });
                setShowSuggestions(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="flex-1 truncate">{c.display_name}</span>
              {c.linked_user_id && <span className="text-[9px] text-primary">app</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
