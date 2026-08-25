-- Distinguishes organizer-created "fixed" teams from ad-hoc teams that Custom
-- League's dynamic pairing (lib/tournament/customDynamic.ts) creates on the fly when
-- a player has no fixed partner. Without this marker, the fixed-team generator
-- (computeCustomAutoRound) has no way to avoid scheduling two teams that share a
-- player -- see docs/superpowers/specs/2026-08-25-custom-league-ad-hoc-teams-fix-design.md.
alter table public.teams add column is_ad_hoc boolean not null default false;
