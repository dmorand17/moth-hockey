-- Add "summer" to the season_type enum (after spring, for logical ordering).
alter type season_type add value if not exists 'summer' after 'spring';
