-- Enum mutations live in their own migration so the new values are committed
-- before any subsequent SQL (function bodies, defaults, etc.) tries to use them.
-- Postgres rejects new enum values inside the same transaction that adds them.

alter type user_role rename value 'scorer' to 'scorekeeper';
alter type user_role add value if not exists 'team_captain';
alter type user_role add value if not exists 'player';
