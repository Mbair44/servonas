-- Opinionated, tenant-scoped public websites and website service requests.
begin;

create table public.business_website_settings(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null unique references public.businesses(id) on delete cascade,
 public_slug text not null unique,
 status text not null default 'draft' check(status in('draft','published')),
 template_key text not null default 'modern' check(template_key in('modern','traditional','bold')),
 custom_domain text,
 domain_status text not null default 'not_connected' check(domain_status in('not_connected','pending_verification','connected')),
 primary_color text,
 secondary_color text,
 hero_heading text,
 hero_subheading text,
 about_text text,
 google_review_url text,
 photo_urls text[] not null default '{}',
 request_service_enabled boolean not null default true,
 booking_enabled boolean not null default false,
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,
 unique(business_id,id),
 check(public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
 check(primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'),
 check(secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
 check(custom_domain is null or length(custom_domain) between 3 and 253),
 check(hero_heading is null or length(hero_heading)<=180),
 check(hero_subheading is null or length(hero_subheading)<=500),
 check(about_text is null or length(about_text)<=4000),
 check(cardinality(photo_urls)<=12)
);

create table public.website_service_requests(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null,
 website_id uuid not null,
 customer_id uuid,
 service_id uuid,
 request_key uuid not null,
 lead_status text not null default 'new' check(lead_status in('new','contacted','qualified','booked','lost')),
 customer_name text not null,
 phone text not null,
 email text,
 service_address text not null,
 description text not null,
 preferred_at text,
 source text not null default 'website' check(source='website'),
 submitted_ip_hash text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(business_id,request_key),
 foreign key(business_id,website_id) references public.business_website_settings(business_id,id) on delete cascade,
 foreign key(business_id,customer_id) references public.customers(business_id,id) on delete set null,
 foreign key(business_id,service_id) references public.services(business_id,id) on delete set null,
 check(length(customer_name) between 1 and 200),
 check(length(phone) between 7 and 50),
 check(email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 check(length(service_address) between 3 and 500),
 check(length(description) between 3 and 4000),
 check(preferred_at is null or length(preferred_at)<=200)
);

create index website_requests_business_status_idx on public.website_service_requests(business_id,lead_status,created_at desc);
create index website_requests_rate_idx on public.website_service_requests(business_id,submitted_ip_hash,created_at desc) where submitted_ip_hash is not null;
create unique index business_website_custom_domain_unique on public.business_website_settings(lower(custom_domain)) where custom_domain is not null;

alter table public.business_website_settings enable row level security;
alter table public.website_service_requests enable row level security;
create policy "members read website settings" on public.business_website_settings for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage website settings" on public.business_website_settings for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read website requests" on public.website_service_requests for select to authenticated using(public.is_business_member(business_id));
create policy "managers update website requests" on public.website_service_requests for update to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));

create trigger business_website_settings_updated_at before update on public.business_website_settings for each row execute function public.set_routing_updated_at();
create trigger website_service_requests_updated_at before update on public.website_service_requests for each row execute function public.set_routing_updated_at();

comment on table public.business_website_settings is 'Website-specific presentation and publishing settings; business identity, services, hours, and areas remain live Servonas records.';
comment on table public.website_service_requests is 'Idempotent, rate-limited public website leads linked to deduplicated Servonas customers.';

notify pgrst, 'reload schema';
commit;
