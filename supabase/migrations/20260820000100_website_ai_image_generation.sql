begin;

create table public.ai_image_model_pricing(
 id uuid primary key default gen_random_uuid(),
 provider text not null,
 model text not null,
 image_size text not null,
 image_quality text not null,
 usd_per_image numeric(18,8) not null check(usd_per_image>=0),
 effective_from timestamptz not null,
 effective_to timestamptz,
 source_url text,
 created_at timestamptz not null default now(),
 unique(provider,model,image_size,image_quality,effective_from),
 check(image_size in('1024x1024','1024x1536','1536x1024')),
 check(image_quality in('low','medium','high')),
 check(effective_to is null or effective_to>effective_from)
);

comment on table public.ai_image_model_pricing is 'Versioned image-generation pricing snapshots used to estimate provider image cost.';

insert into public.ai_image_model_pricing(provider,model,image_size,image_quality,usd_per_image,effective_from,source_url) values
 ('openai','gpt-image-1','1024x1024','low',0.011,'2025-04-23T00:00:00Z','https://developers.openai.com/api/docs/models/gpt-image-1'),
 ('openai','gpt-image-1','1024x1536','low',0.016,'2025-04-23T00:00:00Z','https://developers.openai.com/api/docs/models/gpt-image-1'),
 ('openai','gpt-image-1','1536x1024','low',0.016,'2025-04-23T00:00:00Z','https://developers.openai.com/api/docs/models/gpt-image-1'),
 ('openai','gpt-image-1','1024x1024','medium',0.042,'2025-04-23T00:00:00Z','https://developers.openai.com/api/docs/models/gpt-image-1'),
 ('openai','gpt-image-1','1024x1536','medium',0.063,'2025-04-23T00:00:00Z','https://developers.openai.com/api/docs/models/gpt-image-1'),
 ('openai','gpt-image-1','1536x1024','medium',0.063,'2025-04-23T00:00:00Z','https://developers.openai.com/api/docs/models/gpt-image-1'),
 ('openai','gpt-image-1','1024x1024','high',0.167,'2025-04-23T00:00:00Z','https://developers.openai.com/api/docs/models/gpt-image-1'),
 ('openai','gpt-image-1','1024x1536','high',0.250,'2025-04-23T00:00:00Z','https://developers.openai.com/api/docs/models/gpt-image-1'),
 ('openai','gpt-image-1','1536x1024','high',0.250,'2025-04-23T00:00:00Z','https://developers.openai.com/api/docs/models/gpt-image-1');

create table public.website_ai_image_generations(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,
 website_id uuid references public.business_website_settings(id) on delete set null,
 feature text not null default 'website_image_generation' check(feature='website_image_generation'),
 provider text not null,
 model text not null,
 provider_request_id text,
 generation_kind text not null check(generation_kind in('initial','regeneration')),
 status text not null check(status in('generating','generated','saved','discarded','failed','replaced')),
 image_type text not null check(image_type in('hero_banner','professional_at_work','service_being_performed','equipment_tools','before_after','custom_description')),
 image_size text not null check(image_size in('1024x1024','1024x1536','1536x1024')),
 image_quality text not null check(image_quality in('low','medium','high')),
 image_count integer not null default 1 check(image_count>0),
 prompt text not null,
 prompt_metadata jsonb not null default '{}'::jsonb,
 idempotency_key text not null,
 temporary_storage_path text,
 temporary_public_url text,
 saved_photo_url text,
 provider_cost_usd numeric(18,8),
 pricing_status text not null default 'unpriced' check(pricing_status in('priced','unpriced')),
 pricing_snapshot jsonb,
 outcome text not null default 'generated' check(outcome in('generated','saved','discarded','replaced','failed')),
 error_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(business_id,idempotency_key)
);

create unique index website_ai_image_provider_request
 on public.website_ai_image_generations(provider,provider_request_id)
 where provider_request_id is not null;
create index website_ai_image_usage_business_timeline
 on public.website_ai_image_generations(business_id,created_at desc);

create table public.website_ai_image_events(
 id bigint generated always as identity primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,
 generation_id uuid references public.website_ai_image_generations(id) on delete cascade,
 event_name text not null check(event_name in('website_ai_image_opened','website_ai_image_generation_started','website_ai_image_generation_completed','website_ai_image_generation_failed','website_ai_image_saved','website_ai_image_regenerated','website_ai_image_discarded','website_ai_image_limit_reached')),
 metadata jsonb not null default '{}'::jsonb,
 occurred_at timestamptz not null default now()
);

create index website_ai_image_events_business_timeline
 on public.website_ai_image_events(business_id,occurred_at desc);

alter table public.ai_image_model_pricing enable row level security;
alter table public.website_ai_image_generations enable row level security;
alter table public.website_ai_image_events enable row level security;

revoke all on public.ai_image_model_pricing from anon,authenticated;
create policy "members read website ai image generations"
 on public.website_ai_image_generations for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager','staff']));
create policy "members read website ai image events"
 on public.website_ai_image_events for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager','staff']));
revoke insert,update,delete on public.website_ai_image_generations from anon,authenticated;
revoke insert,update,delete on public.website_ai_image_events from anon,authenticated;

create or replace view public.platform_business_ai_image_monthly_usage
with (security_invoker=true) as
select business_id,date_trunc('month',created_at)::date as billing_period_start,
 count(*)::bigint as generation_count,
 count(*) filter(where outcome='saved')::bigint as saved_count,
 count(*) filter(where outcome='discarded')::bigint as discarded_count,
 count(*) filter(where generation_kind='regeneration')::bigint as regeneration_count,
 coalesce(sum(provider_cost_usd) filter(where pricing_status='priced'),0)::numeric(18,8) as provider_cost_usd,
 count(*) filter(where pricing_status='unpriced')::bigint as unpriced_generation_count
from public.website_ai_image_generations
group by business_id,date_trunc('month',created_at)::date;

revoke all on public.platform_business_ai_image_monthly_usage from anon,authenticated;

notify pgrst,'reload schema';
commit;
