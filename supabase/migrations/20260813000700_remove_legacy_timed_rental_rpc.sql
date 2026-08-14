-- The multi-day RPC supersedes the same-day overload. Removing the old public
-- signature prevents callers from bypassing full-interval availability checks.
drop function if exists public.create_public_booking_quantities_timed(
 jsonb,date,text,text,text,text,time,time,text,text,text,text
);
