import { useState, useEffect, useCallback } from "react";
import { Search, X, UserPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  existingMemberIds: string[];
  onAdded: () => void;
}

interface UserResult {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
}

export function SearchUserDialog({ open, onOpenChange, groupId, existingMemberIds, onAdded }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname, avatar_url")
        .eq("is_placeholder", false)
        .or(`name.ilike.%${q.trim()}%,nickname.ilike.%${q.trim()}%`)
        .limit(20);

      if (error) throw error;

      // Filter out users already in the group
      const filtered = (data || []).filter(
        (u) => !existingMemberIds.includes(u.user_id)
      );
      setResults(filtered);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [existingMemberIds]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => search(query), 300);
    return () => clearTimeout(timeout);
  }, [query, open, search]);

  if (!open) return null;

  const handleAdd = async (user: UserResult) => {
    setAdding(user.user_id);
    try {
      const { error } = await supabase.from("group_members").insert({
        group_id: groupId,
        user_id: user.user_id,
        role: "member",
        status: "active",
      });
      if (error) {
        if (error.message?.includes("duplicate")) {
          toast.error("Esse jogador já está no grupo");
        } else {
          throw error;
        }
      } else {
        toast.success(`${user.nickname || user.name} adicionado ao grupo!`);
        setResults((prev) => prev.filter((u) => u.user_id !== user.user_id));
        onAdded();
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao adicionar jogador");
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-[90%] max-w-sm rounded-3xl border border-border bg-card p-6 animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-3 mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Search className="h-7 w-7 text-primary" />
          </div>
          <h3 className="font-display text-base font-bold text-foreground">Buscar jogador</h3>
          <p className="text-center text-xs text-muted-foreground">
            Busque por nome ou apelido para adicionar ao grupo.
          </p>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite o nome ou apelido..."
            className="w-full rounded-2xl border border-border bg-muted/30 pl-9 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {searching && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-xs text-muted-foreground">Nenhum jogador encontrado</p>
            </div>
          )}

          {!searching && query.trim().length < 2 && (
            <div className="py-6 text-center">
              <p className="text-xs text-muted-foreground">Digite pelo menos 2 caracteres</p>
            </div>
          )}

          {results.map((user) => (
            <div
              key={user.user_id}
              className="flex items-center justify-between rounded-2xl px-3 py-2.5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatar
                  avatarUrl={user.avatar_url}
                  name={user.name}
                  size="md"
                  className="border border-border"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user.nickname || user.name}
                  </p>
                  {user.nickname && (
                    <p className="text-[10px] text-muted-foreground truncate">{user.name}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleAdd(user)}
                disabled={adding === user.user_id}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
              >
                {adding === user.user_id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}