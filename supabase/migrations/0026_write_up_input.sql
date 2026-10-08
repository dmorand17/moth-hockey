-- The exact JSON sent to the model for each write-up, so admins can inspect
-- what the AI was told (and fact-check against it). Null for rows written
-- before this migration. Contents are derived from already-public data.
alter table game_write_ups add column input jsonb;
