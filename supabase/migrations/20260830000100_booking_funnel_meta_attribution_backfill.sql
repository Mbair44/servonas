begin;

alter table public.booking_attribution_sessions
  add column if not exists fbclid text;

alter table public.booking_attribution_snapshots
  add column if not exists first_landing_url text,
  add column if not exists first_landing_path text,
  add column if not exists first_referrer text,
  add column if not exists fbclid text;

update public.booking_attribution_snapshots snapshots
set
  first_landing_url = coalesce(snapshots.first_landing_url, sessions.first_landing_url),
  first_landing_path = coalesce(snapshots.first_landing_path, sessions.first_landing_path),
  first_referrer = coalesce(snapshots.first_referrer, sessions.first_referrer),
  fbclid = coalesce(snapshots.fbclid, sessions.fbclid),
  updated_at = now()
from public.booking_attribution_sessions sessions
where snapshots.business_id = sessions.business_id
  and snapshots.attribution_session_id = sessions.id
  and (
    snapshots.first_landing_url is null
    or snapshots.first_landing_path is null
    or snapshots.first_referrer is null
    or snapshots.fbclid is null
  );

notify pgrst,'reload schema';
commit;
