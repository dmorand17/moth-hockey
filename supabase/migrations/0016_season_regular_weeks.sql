-- Store the regular-season length (in weeks) on the season. This is the single
-- source of truth for the schedule length; end_date is derived and, once a
-- schedule is generated, extended to cover the playoff weeks too. Backfill
-- existing rows from the current start/end spread (end = start + weeks×7).
alter table seasons add column if not exists regular_weeks integer;

update seasons
set regular_weeks = greatest(1, round((end_date - start_date) / 7.0)::int)
where regular_weeks is null and end_date is not null;
