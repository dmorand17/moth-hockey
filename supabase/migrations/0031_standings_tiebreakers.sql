-- Default standings tie-breakers after points: fewest PIM, fewest GA, most GF.
-- PIM is derived in application code from regular-season penalty events
-- (this league uses penalty shots, so each penalty counts as 1 PIM).

alter table seasons
  alter column tiebreakers set default '{pim,ga,gf}';

-- Existing seasons still on the previous default (wins, diff, gf) pick up the
-- new league order. Customized lists are left alone.
update seasons
  set tiebreakers = '{pim,ga,gf}'
  where tiebreakers = '{wins,diff,gf}';
