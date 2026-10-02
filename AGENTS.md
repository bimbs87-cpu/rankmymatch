RankMyMatch technical decisions:
- Recompute ranking eligibility and positions in database triggers when snapshots, matches, sets, participants, rounds, or season percentage change; this keeps score-edit paths and ranking screens consistent.
- Ranking eligibility requires a player's recorded sets in completed ranking matches to reach max(1, floor(total recorded ranking sets × seasons.min_eligibility_pct / 100)); incomplete or tied sets still count as participation.
- Dispatch single-match result alerts from authenticated finalization and batch alerts only after all batch scores save, so each involved player gets one alert with their saved results and the round destination.
- Format result alerts with one participant list and sequential set scores, and use a transparent monochrome notification badge; this avoids repeated names and Android's square status icon.
- Render shareable round and ranking images in the browser from dedicated offscreen views; this preserves the displayed scores and opens native sharing without saving a screenshot first.
- Default the Home Elo panel to the latest played group's season and order its rating events by round date and match number; replayed Elo events can share timestamps, and the synthetic Geral ranking has no single-group history.
- Record visits through a validated server function rather than open database writes, so anonymous traffic remains measurable without exposing direct insertion.
- Scope profile reads to the owner and shared-group participants, and group-image uploads to members' group folders, so personal data and file writes stay tied to membership.
- Return public bug-vote totals through an aggregate server function while exposing individual vote rows only to their owner, so counts remain visible without revealing voters.