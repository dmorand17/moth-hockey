-- End date is optional. Admins set start/end dates loosely while planning and
-- adjust them before or after generating a schedule, so the season's end date
-- may be unknown when the season is first created.

alter table seasons
  alter column end_date drop not null;

comment on column seasons.end_date is
  'Optional. Nominal last day of the season; may be null until the schedule is set.';
