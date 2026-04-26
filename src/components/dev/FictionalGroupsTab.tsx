import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listFictionalGroups,
  generateFictionalGroups,
  deleteAllFictionalGroups,
  deleteFictionalGroup,
  simulateRoundForFictional,
} from "@/lib/fictional-groups.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sparkles, Trash2, Play, RefreshCw, Users, Calendar } from "lucide-react";
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

  const { data, isLoading } = useQuery({
    queryKey: ["fictional-groups"],
    queryFn: () => list(),
  });

  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const generateMut = useMutation({
    mutationFn: (wipeExisting: boolean) => gen({ data: { wipeExisting } }),
    onSuccess: (res) => {
      toast.success(`${res.total} grupos gerados`);
      qc.invalidateQueries({ queryKey: ["fictional-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const wipeMut = useMutation({
    mutationFn: () => delAll(),
    onSuccess: (res) => {
      toast.success(`${res.deletedGroups} grupos removidos`);
      qc.invalidateQueries({ queryKey: ["fictional-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delOneMut = useMutation({
    mutationFn: (groupId: string) => delOne({ data: { groupId } }),
    onSuccess: () => {
      toast.success("Grupo removido");
      qc.invalidateQueries({ queryKey: ["fictional-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const simMut = useMutation({
    mutationFn: (groupId: string) => sim({ data: { groupId } }),
    onSuccess: (res) => {
      toast.success(`Rodada ${res.roundNumber} simulada (${res.matches} partidas)`);
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
        <CardContent className="flex flex-wrap gap-2">
          <Button
            onClick={() => generateMut.mutate(false)}
            disabled={generating || wiping}
          >
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
                    <Play className="h-3 w-3 mr-1" /> Simular rodada
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
