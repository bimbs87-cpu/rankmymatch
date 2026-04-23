import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingDown } from "lucide-react";

export type DropSegmentRow = {
  kind: "utm" | "referrer";
  key: string;
  sessions: number;
  signups: number;
  groups: number;
  matches: number;
  signupRate: number;
  groupRate: number;
  matchRate: number;
  worstStage: "signup" | "group" | "match";
  worstDropPct: number;
  causes: string[];
};

const stageLabel: Record<DropSegmentRow["worstStage"], string> = {
  signup: "Sessão → Signup",
  group: "Signup → Grupo",
  match: "Grupo → Partida",
};

interface Props {
  rows: DropSegmentRow[];
}

export function TopDropSegmentsCard({ rows }: Props) {
  if (!rows || rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingDown className="h-4 w-4" />
          Top 10 segmentos com maior queda no funil (7d)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Onde o funil está sangrando. Causas inferidas a partir dos sinais de
          anomalia (ghost users, falta de evento, abandono em /login etc).
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Tipo</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Sess.</TableHead>
                <TableHead className="text-right">Sign.</TableHead>
                <TableHead className="text-right">Grupo</TableHead>
                <TableHead className="text-right">Part.</TableHead>
                <TableHead>Pior etapa</TableHead>
                <TableHead className="text-right">Drop</TableHead>
                <TableHead>Causas prováveis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.kind}-${r.key}-${i}`}>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {r.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[180px] truncate" title={r.key}>
                    {r.key}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.sessions}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.signups}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({r.signupRate}%)
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.groups}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({r.groupRate}%)
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.matches}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({r.matchRate}%)
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {stageLabel[r.worstStage]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge
                      variant={r.worstDropPct > 70 ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      -{r.worstDropPct}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.causes.map((c) => (
                        <Badge
                          key={c}
                          variant="outline"
                          className="text-[10px] font-normal"
                        >
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
