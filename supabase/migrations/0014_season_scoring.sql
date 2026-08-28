-- Per-season scoring config: point system + ordered tie-breakers (after points).
alter table seasons
  add column point_system text not null default '3-2-1'
    check (point_system in ('2-1-0', '3-2-1')),
  add column tiebreakers text[] not null default '{wins,diff,gf}';

-- Existing rows already pick up the defaults above (3-2-1). No backfill needed.
