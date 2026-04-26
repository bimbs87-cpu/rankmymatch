import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listFictionalGroups,
  generateFictionalGroups,
  deleteAllFictionalGroups,
  deleteFictionalGroup,
  simulateRoundForFictional,
  startNewSeasonForFictional,
} from "@/lib/fictional-groups.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sparkles, Trash2, Play, RefreshCw, Users, Calendar, Trophy, FlagTriangleRight } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function FictionalGroupsTab() {
  const qc = useQueryClient();
  const list = useServerFn(listFictionalGroups);
  const gen = useServerFn(generateFictionalGroups);
  const delAll = useServerFn(deleteAllFictionalGroups);
  const delOne = useServerFn(deleteFictionalGroup);
  const sim = useServerFn(simulateRoundForFictional);
  const newSeason = useServerFn(startNewSeasonForFictional);

  const { data, isLoading } = useQuery({
    queryKey: ["fictional-groups"],
    queryFn: async () => list({ headers: await getServerFnAuthHeaders() }),
  });

  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [roundsCount, setRoundsCount] = useState<number>(8);
  const [simRoundsCount, setSimRoundsCount] = useState<number>(1);

  const clampRounds = (n: number) => Math.max(1, Math.min(15, Math.floor(n || 1)));

  const generateMut = useMutation({
    mutationFn: async (wipeExisting: boolean) =>
      gen({
        headers: await getServerFnAuthHeaders(),
        data: { wipeExisting, roundsCount: clampRounds(roundsCount) },
      }),
    onSuccess: (res) => {
      toast.success(`${res.total} grupos gerados (${res.roundsPerGroup} rodadas cada)`);
      qc.invalidateQueries({ queryKey: ["fictional-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const wipeMut = useMutation({
    mutationFn: async () => delAll({ headers: await getServerFnAuthHeaders() }),
    onSuccess: (res) => {
      toast.success(`${res.deletedGroups} grupos removidos`);
      qc.invalidateQueries({ queryKey: ["fictional-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delOneMut = useMutation({
    mutationFn: async (groupId: string) =>
      delOne({ headers: await getServerFnAuthHeaders(), data: { groupId } }),
    onSuccess: () => {
      toast.success("Grupo removido");
      qc.invalidateQueries({ queryKey: ["fictional-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const simMut = useMutation({
    mutationFn: async (groupId: string) =>
      sim({
        headers: await getServerFnAuthHeaders(),
        data: { groupId, roundsCount: clampRounds(simRoundsCount) },
      }),
    onSuccess: (res) => {
      toast.success(`${res.roundsSimulated} rodada(s) simulada(s) — ${res.matches} partidas`);
      qc.invalidateQueries({ queryKey: ["fictional-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const newSeasonMut = useMutation({
    mutationFn: async (groupId: string) =>
      newSeason({ headers: await getServerFnAuthHeaders(), data: { groupId } }),
    onSuccess: (res) => {
      toast.success(`Nova temporada criada: ${res.seasonName}`);
      qc.invalidateQueries({ queryKey: ["fictional-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = data?.groups ?? [];
  const generating = generateMut.isPending;
  const wiping = wipeMut.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Grupos fictícios públicos
          </CardTitle>
          <CardDescription>
            Popula a página inicial e o /explore com 10 grupos públicos contendo
            membros, temporada ativa, partidas concluídas e ELO. Tudo é marcado
            como <code className="text-xs">is_fictional = true</code> para
            isolamento total dos dados reais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Rodadas concluídas por grupo (1–15)
              <input
                type="number"
                min={1}
                max={15}
                value={roundsCount}
                onChange={(e) => setRoundsCount(clampRounds(Number(e.target.value)))}
                className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => generateMut.mutate(false)} disabled={generating || wiping}>
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Gerar 10 grupos
            </Button>
            <Button
              variant="outline"
              onClick={() => generateMut.mutate(true)}
              disabled={generating || wiping}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Recriar tudo (limpa antes)
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmWipe(true)}
              disabled={generating || wiping || groups.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Apagar todos
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando…
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum grupo fictício ainda. Clique em <strong>Gerar 10 grupos</strong> acima.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card/40 p-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Rodadas a simular por clique (1–15)
              <input
                type="number"
                min={1}
                max={15}
                value={simRoundsCount}
                onChange={(e) => setSimRoundsCount(clampRounds(Number(e.target.value)))}
                className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{g.name}</CardTitle>
                  <Badge variant="secondary" className="text-[10px] uppercase shrink-0">
                    {g.sport}
                  </Badge>
                </div>
                <CardDescription className="text-xs font-mono">
                  {g.public_code}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="outline">
                    {g.match_format === "singles" ? "Singles" : "Duplas"}
                  </Badge>
                  {g.singles_group_type && (
                    <Badge variant="outline">{g.singles_group_type}</Badge>
                  )}
                  <Badge variant="outline">{g.member_limit} pessoas</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {g.memberCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {g.roundCount} rodadas
                  </span>
                  <span>{g.seasonCount} temp.</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => simMut.mutate(g.id)}
                    disabled={simMut.isPending}
                  >
                    <Play className="h-3 w-3 mr-1" /> Simular {simRoundsCount} rodada{simRoundsCount > 1 ? "s" : ""}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDelete(g.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
        </>
      )}

      <AlertDialog open={confirmWipe} onOpenChange={setConfirmWipe}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar todos os grupos fictícios?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove os {groups.length} grupos, seus membros placeholder, temporadas,
              rodadas, partidas e eventos de rating. Dados reais não são afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmWipe(false);
                wipeMut.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este grupo fictício?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o grupo, seus membros placeholder e todo o histórico associado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) delOneMut.mutate(confirmDelete);
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
