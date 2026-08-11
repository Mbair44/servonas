begin;

create table public.ai_model_pricing(
 id uuid primary key default gen_random_uuid(),
 provider text not null,
 model text not null,
 input_usd_per_million_tokens numeric(18,8) not null check(input_usd_per_million_tokens>=0),
 cached_input_usd_per_million_tokens numeric(18,8) not null check(cached_input_usd_per_million_tokens>=0),
 output_usd_per_million_tokens numeric(18,8) not null check(output_usd_per_million_tokens>=0),
 effective_from timestamptz not null,
 effective_to timestamptz,
 source_url text,
 created_at timestamptz not null default now(),
 unique(provider,model,effective_from),
 check(effective_to is null or effective_to>effective_from)
);

comment on table public.ai_model_pricing is 'Versioned provider pricing used to snapshot AI cost when a request completes.';

insert into public.ai_model_pricing(
 provider,model,input_usd_per_million_tokens,cached_input_usd_per_million_tokens,
 output_usd_per_million_tokens,effective_from,source_url
) values (
 'openai','gpt-4.1-mini',0.40,0.10,1.60,'2025-04-14T00:00:00Z',
 'https://developers.openai.com/api/docs/models/gpt-4.1-mini'
);

create table public.ai_provider_usage(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,
 conversation_id uuid references public.ai_conversations(id) on delete set null,
 provider text not null,
 model text not null,
 provider_request_id text,
 input_tokens integer not null default 0 check(input_tokens>=0),
 cached_input_tokens integer not null default 0 check(cached_input_tokens>=0),
 output_tokens integer not null default 0 check(output_tokens>=0),
 total_tokens integer not null default 0 check(total_tokens>=0),
 input_cost_usd numeric(18,8),
 cached_input_cost_usd numeric(18,8),
 output_cost_usd numeric(18,8),
 total_cost_usd numeric(18,8),
 pricing_status text not null check(pricing_status in('priced','unpriced')),
 pricing_snapshot jsonb,
 billing_period_start date not null,
 occurred_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);

create unique index ai_provider_usage_provider_request
 on public.ai_provider_usage(provider,provider_request_id)
 where provider_request_id is not null;
create index ai_provider_usage_business_period
 on public.ai_provider_usage(business_id,billing_period_start,occurred_at desc);

alter table public.ai_model_pricing enable row level security;
alter table public.ai_provider_usage enable row level security;
revoke all on public.ai_model_pricing from anon,authenticated;
revoke all on public.ai_provider_usage from anon,authenticated;

create view public.platform_business_ai_monthly_usage
with (security_invoker=true) as
select business_id,billing_period_start,
 count(*)::bigint as request_count,
 coalesce(sum(input_tokens),0)::bigint as input_tokens,
 coalesce(sum(cached_input_tokens),0)::bigint as cached_input_tokens,
 coalesce(sum(output_tokens),0)::bigint as output_tokens,
 coalesce(sum(total_tokens),0)::bigint as total_tokens,
 coalesce(sum(total_cost_usd) filter(where pricing_status='priced'),0)::numeric(18,8) as provider_cost_usd,
 count(*) filter(where pricing_status='unpriced')::bigint as unpriced_request_count
from public.ai_provider_usage group by business_id,billing_period_start;

create view public.platform_business_twilio_monthly_usage
with (security_invoker=true) as
select business_id,billing_period_start,
 count(*)::bigint as message_count,
 coalesce(sum(num_segments) filter(where usage_finalized_at is not null and direction like 'outbound%' and channel='sms'),0)::bigint as outbound_sms_segments,
 coalesce(sum(abs(twilio_price)) filter(where usage_finalized_at is not null),0)::numeric(18,8) as provider_cost,
 case when count(distinct upper(twilio_price_unit)) filter(where usage_finalized_at is not null and twilio_price_unit is not null)=1
  then max(upper(twilio_price_unit)) filter(where usage_finalized_at is not null) else null end as provider_cost_currency,
 count(*) filter(where usage_finalized_at is null)::bigint as unfinalized_message_count
from public.twilio_message_usage group by business_id,billing_period_start;

revoke all on public.platform_business_ai_monthly_usage from anon,authenticated;
revoke all on public.platform_business_twilio_monthly_usage from anon,authenticated;

notify pgrst,'reload schema';
commit;
