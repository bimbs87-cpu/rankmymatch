---
name: Singles (1x1) format support
description: Full singles support — group types (rivalry/league/casual), sets config, pairing modes, format-aware UI
type: feature
---

## Singles Format (Phase 2)
- Groups can be created as `match_format = "singles"` with `singles_group_type` (rivalry | league | casual)
- Rivalry: 2 fixed players, League: multiple players with ranking, Casual: free matches
- Season creation for singles includes: sets_per_match (1 or 3), singles_pairing_mode (manual/random/round_robin), odd_player_rule (bye/queue_point/admin_decides)
- drawTeams supports singles (2 players per match instead of 4)
- ManualMatchDialog accepts matchFormat prop, adapts player count and labels
- Round detail page shows format-aware labels (confronto vs set, slots_per_round = 2 for singles)
- "Lançar Rei da Quadra" becomes "Montar Confrontos" in singles context
- DB columns: groups.singles_group_type, seasons.sets_per_match/singles_pairing_mode/odd_player_rule, matches.is_exhibition/counts_for_ranking
