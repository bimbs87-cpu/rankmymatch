---
name: Rivalry mode for 1v1 groups
description: Auto-detected rivalry when singles group has ≤2 members — duel UI, simplified rounds, no manual player selection
type: feature
---

## Rivalry Mode
- Detected automatically via `isRivalryGroup()` in `src/lib/rivalry.ts`
- Condition: `match_format === "singles"` AND (`singles_group_type === "rivalry"` OR `memberCount <= 2`)
- Group detail page shows "Duelo" tab instead of "Ranking" with face-off card (avatars, wins, Elo)
- Round detail: skip player selection, presence is auto-managed
  - "Lançar Resultado" button auto-creates match with both members and opens score dialog
  - Hides draw button, manual match creation, presence confirmation, confirmed players list
- Season creation form hides: pairing mode, odd player rule, courts, **sets per match** for rivalry groups
  - Sets default to 1; user adds more dynamically in score dialog ("+ Adicionar Set")
- Score dialog for rivalry: `setsPerMatch=99` (unlimited), starts with 1 set, "add +1 set" button always available
  - Winner = whoever has more valid sets (no tie allowed)
- Keeps: season type, round dates, time, retroactive toggle
- Deleting the last match resets round status back to "scheduled"
- Deleting a match recalculates round state (implemented in `deleteMatch` in use-seasons.tsx)
