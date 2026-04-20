import { Link } from "@tanstack/react-router";
import { UserPlus, Link2, Swords, AlertCircle } from "lucide-react";
import { useGroupPendingTasks } from "@/hooks/use-group-pending-tasks";

interface Props {
  groupId: string;
  /** Called when admin taps the "results" badge to switch to the Results tab. */
  onGotoResults?: () => void;
}

/**
 * Compact strip of badges showing pending admin tasks for the current group.
 * Renders nothing when there are no pendencies.
 */
export function AdminPendingBadges({ groupId, onGotoResults }: Props) {
  const { counts } = useGroupPendingTasks(groupId);
  if (counts.total === 0) return null;

  return (
    <div className="rounded-3xl border border-warning/30 bg-warning/5 p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-warning">
        <AlertCircle className="h-3.5 w-3.5" />
        Pendências do admin
        <span className="ml-1 rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-black text-warning">
          {counts.total}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {counts.joinRequests > 0 && (
          <Link
            to="/admin/inbox"
            className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-warning/10"
          >
            <UserPlus className="h-3.5 w-3.5 text-warning" />
            {counts.joinRequests} solicitaç{counts.joinRequests === 1 ? "ão" : "ões"} de entrada
          </Link>
        )}
        {counts.playerClaims > 0 && (
          <Link
            to="/admin/inbox"
            className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-warning/10"
          >
            <Link2 className="h-3.5 w-3.5 text-warning" />
            {counts.playerClaims} reivindicaç{counts.playerClaims === 1 ? "ão" : "ões"} de jogador
          </Link>
        )}
        {counts.matchResults > 0 && (
          <button
            onClick={onGotoResults}
            className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-warning/10"
          >
            <Swords className="h-3.5 w-3.5 text-warning" />
            {counts.matchResults} resultado{counts.matchResults === 1 ? "" : "s"} aguardando aprovação
          </button>
        )}
      </div>
    </div>
  );
}
