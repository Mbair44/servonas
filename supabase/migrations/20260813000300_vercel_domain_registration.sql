begin;

alter table public.business_website_onboarding_states
 drop constraint if exists business_website_onboarding_domain_request_status_check;
alter table public.business_website_onboarding_states
 add constraint business_website_onboarding_domain_request_status_check
 check(domain_request_status is null or domain_request_status in(
  'requested','availability_check_needed','available','premium_review','approved',
  'registration_pending','purchased','registered','connected','unavailable','failed'
 ));

create table if not exists public.website_domain_orders(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 domain_name text not null,
 provider text not null default 'vercel' check(provider='vercel'),
 status text not null check(status in('available','premium_review','registration_pending','registered','connected','unavailable','failed')),
 purchase_price numeric(12,2),
 renewal_price numeric(12,2),
 currency text not null default 'USD' check(currency='USD'),
 registration_years integer not null default 1 check(registration_years=1),
 auto_renew boolean not null default true,
 provider_order_id text unique,
 availability_checked_at timestamptz,
 purchase_confirmed_at timestamptz,
 registered_at timestamptz,
 renewal_notice_at timestamptz,
 last_error_category text,
 created_by uuid references auth.users(id),
 updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(business_id,domain_name)
);

create index if not exists website_domain_orders_renewal_notice_idx
 on public.website_domain_orders(renewal_notice_at)
 where status in('registered','connected') and renewal_notice_at is not null;

alter table public.website_domain_orders enable row level security;
comment on table public.website_domain_orders is
 'Server-managed Vercel registrar orders. Purchases require a Servonas platform-admin action and exact expected-price confirmation.';
comment on column public.website_domain_orders.purchase_price is
 'Provider quote used as Vercel expectedPrice. This is provider cost and is not a customer charge.';

notify pgrst,'reload schema';
commit;
