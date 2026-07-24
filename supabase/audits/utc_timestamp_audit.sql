-- UTC timestamp audit
--
-- PostgreSQL stores every `timestamp with time zone` (`timestamptz`) value as
-- an absolute UTC instant. Run this after migrations to find accidental
-- `timestamp without time zone` columns in the public schema:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/audits/utc_timestamp_audit.sql
--
-- Expected result: zero rows.
--
-- Deliberate wall-clock fields such as booking_availability.start_time and
-- end_time are SQL `time` values, not instants. Date-only rental/business
-- fields likewise must not be converted to timestamps.
select
  table_schema,
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and data_type = 'timestamp without time zone'
order by table_name, ordinal_position;

-- Supabase/PostgreSQL normally uses UTC. This confirms the current connection
-- returns timestamps in UTC as well.
show timezone;
