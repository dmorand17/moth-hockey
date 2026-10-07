-- Each query must return 0 rows/0 for a healthy seed.
select 'duplicate names' as problem, first_name || ' ' || last_name as detail
from players p join team_players tp on tp.player_id = p.id
join seasons s on s.id = tp.season_id and s.is_current
group by 2 having count(*) > 1;

select 'ot game without exactly one P4 goal' as problem, g.id::text as detail
from games g
where g.status = 'final' and g.decided_in = 'ot'
  and (select count(*) from game_events e where e.game_id = g.id and e.type = 'goal' and e.period = 4) <> 1;

select 'no subs in seed' as problem, '' as detail
where not exists (select 1 from game_appearances where is_sub);
