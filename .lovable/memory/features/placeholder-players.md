---
name: Placeholder Players (Ghost Players)
description: Admins can add players by name only without login; real users can claim and merge
type: feature
---
- user_profiles has `is_placeholder` and `created_by_admin` columns
- Placeholder players have a random UUID as user_id (no auth.users entry)
- player_claims table manages claim requests (pending → approved/rejected)
- merge_placeholder_player() RPC transfers all data (matches, ranking, stats, presence) from placeholder to real user
- AddPlaceholderPlayerDialog: admin adds player by name
- ClaimPlayerDialog: user selects which placeholder they are
- PlayerClaimsManager: admin approves/rejects claims
- Badge "Sem conta" (Ghost icon) shown next to placeholder members in group page
