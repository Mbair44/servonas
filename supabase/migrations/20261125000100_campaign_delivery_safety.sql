-- Campaign sends must have a durable pre-provider claim. A claimed recipient is
-- never retried automatically after an unknown post-provider persistence error.
begin;

alter table public.customer_campaign_recipients
 add column if not exists send_claimed_at timestamptz,
 add column if not exists send_attempt_token uuid;

alter table public.customer_campaign_recipients drop constraint if exists customer_campaign_recipients_status_check;
alter table public.customer_campaign_recipients add constraint customer_campaign_recipients_status_check
 check(status in('queued','sending','sent','delivered','failed','skipped'));

create index if not exists customer_campaign_recipients_claim_idx
 on public.customer_campaign_recipients(business_id,campaign_id,status,send_claimed_at);

notify pgrst,'reload schema';
commit;
