begin;

alter table public.business_twilio_accounts
 add column if not exists external_twilio_account boolean not null default false;

alter table public.business_twilio_accounts
 add column if not exists external_twilio_previous_state jsonb;

comment on column public.business_twilio_accounts.external_twilio_account is
 'Whether this business mapping uses an externally managed Twilio account. This marker does not grant access or store credentials.';

comment on column public.business_twilio_accounts.external_twilio_previous_state is
 'Temporary non-secret snapshot used to restore the prior tenant mapping after the external pilot.';

commit;
