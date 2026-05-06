import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Users, User, Calendar, MapPin, Search, Check, X } from "lucide-react";

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

interface Participant {
  key: string; // stable client id
  contactId: string | null;
  linkedUserId: string | null;
  name: string;
  isOwner?: boolean;
}

interface SetRow {
  a: string;
  b: string;
  teamAKeys: string[];
  teamBKeys: string[];
}

let _kid = 0;
const newKey = () => `p_${++_kid}_${Date.now()}`;

export function CasualMatchDialog({ open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const { displayName } = useUserProfile();
  const [format, setFormat] = useState<"singles" | "doubles">("doubles");
  const [playedOn, setPlayedOn] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState(false);

  const perSide = format === "singles" ? 1 : 2;

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
    if (open && user) {
      setFormat("doubles");
      setPlayedOn(new Date().toISOString().slice(0, 10));
      setLocation("");
      const ownerKey = newKey();
      setParticipants([
        { key: ownerKey, contactId: null, linkedUserId: user.id, name: displayName || "Você", isOwner: true },
      ]);
      setSets([{ a: "", b: "", teamAKeys: [ownerKey], teamBKeys: [] }]);
    }
  }, [open, user, displayName]);

  const addParticipant = () => {
    setParticipants((prev) => [...prev, { key: newKey(), contactId: null, linkedUserId: null, name: "" }]);
  };

  const removeParticipant = (key: string) => {
    setParticipants((prev) => prev.filter((p) => p.key !== key));
    setSets((prev) =>
      prev.map((s) => ({
        ...s,
        teamAKeys: s.teamAKeys.filter((k) => k !== key),
        teamBKeys: s.teamBKeys.filter((k) => k !== key),
      })),
    );
  };

  const updateParticipant = (key: string, patch: Partial<Participant>) => {
    setParticipants((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };

  const togglePlayerInSet = (setIdx: number, key: string, team: "a" | "b") => {
    setSets((prev) =>
      prev.map((s, i) => {
        if (i !== setIdx) return s;
        const aKeys = s.teamAKeys.filter((k) => k !== key);
        const bKeys = s.teamBKeys.filter((k) => k !== key);
        const wasInTeam = s.teamAKeys.includes(key) ? "a" : s.teamBKeys.includes(key) ? "b" : null;
        if (wasInTeam === team) {
          return { ...s, teamAKeys: aKeys, teamBKeys: bKeys };
        }
        if (team === "a") {
          const next = [...aKeys, key];
          return { ...s, teamAKeys: next.slice(-perSide), teamBKeys: bKeys };
        } else {
          const next = [...bKeys, key];
          return { ...s, teamAKeys: aKeys, teamBKeys: next.slice(-perSide) };
        }
      }),
    );
  };

  const addSet = () => {
    setSets((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          a: "",
          b: "",
          teamAKeys: last ? [...last.teamAKeys] : [],
          teamBKeys: last ? [...last.teamBKeys] : [],
        },
      ];
    });
  };

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

  const handleSave = async () => {
    if (!user) return;
    // Validate participants
    if (participants.some((p) => !p.name.trim())) {
      toast.error("Preencha o nome de todos os jogadores");
      return;
    }
    // Validate sets
    const validSets = sets.filter((s) => s.a !== "" && s.b !== "");
    if (validSets.length === 0) {
      toast.error("Adicione ao menos 1 set com pontuação");
      return;
    }
    for (let i = 0; i < validSets.length; i++) {
      const s = validSets[i];
      if (s.teamAKeys.length !== perSide || s.teamBKeys.length !== perSide) {
        toast.error(`Set ${i + 1}: selecione ${perSide} jogador(es) em cada lado`);
        return;
      }
    }

    setSaving(true);
    try {
      // Auto-create contacts for free names
      const ensure = async (p: Participant): Promise<Participant> => {
        if (p.contactId || p.linkedUserId) return p;
        const trimmed = p.name.trim();
        const existing = contacts.find((c) => c.display_name.toLowerCase() === trimmed.toLowerCase());
        if (existing) return { ...p, contactId: existing.id };
        const { data, error } = await supabase
          .from("personal_contacts")
          .insert({ owner_user_id: user.id, display_name: trimmed })
          .select("id, display_name, nickname, linked_user_id")
          .single();
        if (error) throw error;
        setContacts((prev) => [...prev, data as Contact]);
        return { ...p, contactId: data.id };
      };

      const resolved: Participant[] = [];
      for (const p of participants) resolved.push(await ensure(p));

      // Determine each participant's "primary" team by majority across sets
      const teamFor = (key: string): "a" | "b" => {
        let a = 0, b = 0;
        for (const s of validSets) {
          if (s.teamAKeys.includes(key)) a++;
          if (s.teamBKeys.includes(key)) b++;
        }
        if (a === 0 && b === 0) return resolved.find((r) => r.key === key)?.isOwner ? "a" : "b";
        return a >= b ? "a" : "b";
      };

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

      const partRows = resolved.map((p) => ({
        match_id: match.id,
        team: teamFor(p.key),
        contact_id: p.contactId,
        linked_user_id: p.linkedUserId,
        display_name: p.name.trim(),
        is_owner: !!p.isOwner,
      }));
      const { data: insertedParts, error: pErr } = await supabase
        .from("casual_match_participants")
        .insert(partRows)
        .select("id, display_name, linked_user_id, contact_id, is_owner");
      if (pErr) throw pErr;

      // Map client key → DB participant id
      const keyToId = new Map<string, string>();
      const used = new Set<string>();
      for (const p of resolved) {
        const match = (insertedParts || []).find((row) => {
          if (used.has(row.id)) return false;
          if (p.linkedUserId && row.linked_user_id === p.linkedUserId) return true;
          if (p.contactId && row.contact_id === p.contactId) return true;
          if (!p.linkedUserId && !p.contactId && row.display_name === p.name.trim()) return true;
          return false;
        });
        if (match) {
          keyToId.set(p.key, match.id);
          used.add(match.id);
        }
      }

      const setRows = validSets.map((s, i) => ({
        match_id: match.id,
        set_number: i + 1,
        score_team_a: parseInt(s.a, 10) || 0,
        score_team_b: parseInt(s.b, 10) || 0,
        team_a_participant_ids: s.teamAKeys.map((k) => keyToId.get(k)).filter(Boolean) as string[],
        team_b_participant_ids: s.teamBKeys.map((k) => keyToId.get(k)).filter(Boolean) as string[],
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
            Cadastre os jogadores e monte os times de cada set — pode trocar duplas a cada set.
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

          {/* Participants roster */}
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <div className="mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Jogadores ({participants.length})
              </span>
            </div>
            <div className="space-y-2">
              {participants.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  {p.isOwner ? (
                    <div className="flex flex-1 items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">EU</div>
                      <span className="font-semibold">{p.name}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        <ContactPicker
                          value={p}
                          onChange={(patch) => updateParticipant(p.key, patch)}
                          contacts={contacts}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeParticipant(p.key)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remover jogador"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addParticipant}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-2 text-[11px] font-bold text-primary hover:bg-primary/10"
            >
              <Plus className="h-3 w-3" /> Adicionar jogador
            </button>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Adicione todos que jogaram. Em cada set abaixo, clique nos nomes para montar os times daquele set.
            </p>
          </div>

          {/* Sets with per-set lineup */}
          <div>
            <div className="mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Sets
              </span>
            </div>
            <div className="space-y-3">
              {sets.map((s, i) => (
                <SetEditor
                  key={i}
                  index={i}
                  setRow={s}
                  perSide={perSide}
                  participants={participants}
                  onTogglePlayer={(key, team) => togglePlayerInSet(i, key, team)}
                  onScoreChange={(field, val) =>
                    setSets((prev) => prev.map((x, j) => (j === i ? { ...x, [field]: val } : x)))
                  }
                  onRemove={
                    sets.length > 1
                      ? () => setSets((prev) => prev.filter((_, j) => j !== i))
                      : undefined
                  }
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addSet}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-2 text-[11px] font-bold text-primary hover:bg-primary/10"
            >
              <Plus className="h-3 w-3" /> Adicionar set
            </button>
            {winner && (
              <p className="mt-2 text-[11px] font-semibold text-success">
                <Check className="mr-1 inline h-3 w-3" />
                Vencedor: Time {winner === "a" ? "A" : "B"}
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

function SetEditor({
  index,
  setRow,
  perSide,
  participants,
  onTogglePlayer,
  onScoreChange,
  onRemove,
}: {
  index: number;
  setRow: SetRow;
  perSide: number;
  participants: Participant[];
  onTogglePlayer: (key: string, team: "a" | "b") => void;
  onScoreChange: (field: "a" | "b", val: string) => void;
  onRemove?: () => void;
}) {
  const teamOf = (key: string): "a" | "b" | null =>
    setRow.teamAKeys.includes(key) ? "a" : setRow.teamBKeys.includes(key) ? "b" : null;

  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold">Set {index + 1}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Remover set"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Player chips with A/B toggles */}
      <div className="mb-2 space-y-1.5">
        {participants.length === 0 || participants.some((p) => !p.name.trim()) ? (
          <p className="text-[11px] italic text-muted-foreground">
            Cadastre os jogadores acima para montar os times.
          </p>
        ) : (
          participants.map((p) => {
            const t = teamOf(p.key);
            return (
              <div key={p.key} className="flex items-center gap-2">
                <span className="flex-1 truncate text-xs">{p.name || "—"}</span>
                <button
                  type="button"
                  onClick={() => onTogglePlayer(p.key, "a")}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                    t === "a"
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  Time A
                </button>
                <button
                  type="button"
                  onClick={() => onTogglePlayer(p.key, "b")}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                    t === "b"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                  }`}
                >
                  Time B
                </button>
              </div>
            );
          })
        )}
        <p className="text-[10px] text-muted-foreground">
          Selecione {perSide} {perSide === 1 ? "jogador" : "jogadores"} em cada lado.
        </p>
      </div>

      {/* Score */}
      <div className="flex items-center justify-center gap-2 border-t border-border pt-2">
        <span className="text-[10px] font-bold uppercase text-primary">A</span>
        <input
          type="number"
          min={0}
          value={setRow.a}
          onChange={(e) => onScoreChange("a", e.target.value)}
          className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm"
        />
        <span className="text-muted-foreground">×</span>
        <input
          type="number"
          min={0}
          value={setRow.b}
          onChange={(e) => onScoreChange("b", e.target.value)}
          className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm"
        />
        <span className="text-[10px] font-bold uppercase text-destructive">B</span>
      </div>
    </div>
  );
}

function ContactPicker({
  value,
  onChange,
  contacts,
}: {
  value: Participant;
  onChange: (patch: Partial<Participant>) => void;
  contacts: Contact[];
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [userResults, setUserResults] = useState<{ user_id: string; name: string; nickname: string | null }[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const filteredContacts = useMemo(() => {
    const q = value.name.trim().toLowerCase();
    if (!q) return contacts.slice(0, 5);
    return contacts.filter((c) => c.display_name.toLowerCase().includes(q)).slice(0, 5);
  }, [value.name, contacts]);

  // Search platform users (debounced)
  useEffect(() => {
    const q = value.name.trim();
    if (q.length < 2 || value.linkedUserId) {
      setUserResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchingUsers(true);
      const { data } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname")
        .eq("is_placeholder", false)
        .or(`name.ilike.%${q}%,nickname.ilike.%${q}%`)
        .limit(5);
      // Exclude users already linked via existing contacts
      const linkedIds = new Set(contacts.map((c) => c.linked_user_id).filter(Boolean) as string[]);
      setUserResults((data || []).filter((u) => !linkedIds.has(u.user_id)));
      setSearchingUsers(false);
    }, 300);
    return () => clearTimeout(t);
  }, [value.name, value.linkedUserId, contacts]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value, contactId: null, linkedUserId: null })}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="Nome ou buscar usuário"
          className="flex-1 bg-transparent py-2 text-sm outline-none"
        />
        {(value.contactId || value.linkedUserId) && <Check className="h-3.5 w-3.5 text-success" />}
      </div>
      {showSuggestions && (filteredContacts.length > 0 || userResults.length > 0 || searchingUsers) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {filteredContacts.length > 0 && (
            <>
              <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Meus contatos</p>
              {filteredContacts.map((c) => (
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
                  {c.linked_user_id && <span className="text-[9px] text-primary">vinculado</span>}
                </button>
              ))}
            </>
          )}
          {userResults.length > 0 && (
            <>
              <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Usuários do app</p>
              {userResults.map((u) => (
                <button
                  type="button"
                  key={u.user_id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange({
                      name: u.nickname || u.name,
                      contactId: null,
                      linkedUserId: u.user_id,
                    });
                    setShowSuggestions(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <User className="h-3 w-3 text-primary" />
                  <span className="flex-1 truncate">{u.nickname || u.name}</span>
                  <span className="text-[9px] text-primary">app</span>
                </button>
              ))}
            </>
          )}
          {searchingUsers && (
            <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> buscando…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
