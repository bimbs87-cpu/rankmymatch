---
name: Rivalry mode for 1v1 groups
description: Auto-detected rivalry when singles group has ≤2 members — full duel page replaces ranking, status states corrected
type: feature
---

## Rivalry Mode
- Detected automatically via `isRivalryGroup()` in `src/lib/rivalry.ts`
- Condition: `match_format === "singles"` AND (`singles_group_type === "rivalry"` OR `memberCount <= 2`)

## Duel Page (`src/components/RivalryDuelPage.tsx`)
- Replaces generic ranking table when rivalry group detected
- Blocks: header + face-off, overall score, Elo comparison, head-to-head stats, recent matches, Elo chart, comparativo
- Match history shows "Oficial" vs "Avulso" badges
- Win rates, streaks, set/game balances

## Ranking Tab Routing
- When user's group is rivalry, `/ranking` shows Duelo page instead of generic ranking
- Season switcher still available if user has non-rivalry groups too

## Round/Match Status States
- Match: scheduled → "Aguardando resultado", in_progress → "Em andamento", completed → "Finalizado"
- Round: auto-completes to "completed" when all matches done (via `submitMatchScore`)
- Deleting last match resets round to "scheduled"; deleting match recalculates round state
- Home page shows correct status labels

## Score Dialog for Rivalry
- `setsPerMatch=99` (unlimited), starts with 1 set, "add +1 set" button always available
- Winner = whoever has more valid sets (no tie allowed)
- Season creation hides sets config for rivalry
- Score editing reverts previous Elo and re-applies on re-submit (`revertMatchEloServer`)

## Auto-flow for Rivalry
- `confirmPresence` auto-creates the match via `drawTeams` when both members are confirmed (no manual "Iniciar confronto" needed; button kept as fallback)
- Presence buttons in `GroupDashboardPanel` are disabled when already in that state (prevents double-click)
- "Rodada encerrada" chip replaces presence buttons when `round.status === "completed"`

## Group Detail
- Tab shows "Duelo" instead of "Ranking" for rivalry
- Face-off card with avatars, wins, Elo
- Presence and draw hidden for rivalry rounds
