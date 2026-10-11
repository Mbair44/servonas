begin;

-- Inbound SMS can identify a person only by their verified sender number.
-- Email uniqueness already applies only to non-empty email values, so a
-- phone-only customer remains tenant-scoped and does not weaken email dedupe.
alter table public.customers
 alter column email drop not null;

notify pgrst,'reload schema';
commit;
