begin;

alter table public.business_website_settings
 add column if not exists lead_capture_popup_enabled boolean not null default false,
 add column if not exists lead_capture_popup_headline text,
 add column if not exists lead_capture_popup_body text,
 add column if not exists lead_capture_popup_discount_type text,
 add column if not exists lead_capture_popup_discount_value integer,
 add column if not exists lead_capture_popup_custom_offer text,
 add column if not exists lead_capture_popup_coupon_code text,
 add column if not exists lead_capture_popup_cta_text text,
 add column if not exists lead_capture_popup_delay_seconds integer not null default 7,
 add column if not exists lead_capture_popup_expires_at timestamptz,
 add column if not exists lead_capture_popup_service_id uuid,
 add column if not exists lead_capture_popup_inventory_item_id uuid,
 add column if not exists lead_capture_popup_minimum_subtotal_cents integer,
 add column if not exists lead_capture_popup_success_message text,
 add column if not exists lead_capture_popup_disclosure text;

alter table public.business_website_settings
 drop constraint if exists business_website_settings_lead_capture_popup_discount_type_check,
 add constraint business_website_settings_lead_capture_popup_discount_type_check
 check (
  lead_capture_popup_discount_type is null
  or lead_capture_popup_discount_type in ('fixed','percentage','custom')
 );

alter table public.business_website_settings
 drop constraint if exists business_website_settings_lead_capture_popup_delay_check,
 add constraint business_website_settings_lead_capture_popup_delay_check
 check (lead_capture_popup_delay_seconds between 1 and 60);

alter table public.business_website_settings
 drop constraint if exists business_website_settings_lead_capture_popup_value_check,
 add constraint business_website_settings_lead_capture_popup_value_check
 check (
  lead_capture_popup_discount_value is null
  or lead_capture_popup_discount_value > 0
 );

alter table public.business_website_settings
 drop constraint if exists business_website_settings_lead_capture_popup_minimum_check,
 add constraint business_website_settings_lead_capture_popup_minimum_check
 check (
  lead_capture_popup_minimum_subtotal_cents is null
  or lead_capture_popup_minimum_subtotal_cents >= 0
 );

alter table public.business_website_settings
 drop constraint if exists business_website_settings_lead_capture_popup_lengths_check,
 add constraint business_website_settings_lead_capture_popup_lengths_check
 check (
  (lead_capture_popup_headline is null or length(lead_capture_popup_headline) between 1 and 180)
  and (lead_capture_popup_body is null or length(lead_capture_popup_body) between 1 and 600)
  and (lead_capture_popup_custom_offer is null or length(lead_capture_popup_custom_offer) between 1 and 200)
  and (lead_capture_popup_coupon_code is null or lead_capture_popup_coupon_code ~ '^[A-Za-z0-9_-]{2,40}$')
  and (lead_capture_popup_cta_text is null or length(lead_capture_popup_cta_text) between 1 and 80)
  and (lead_capture_popup_success_message is null or length(lead_capture_popup_success_message) between 1 and 500)
  and (lead_capture_popup_disclosure is null or length(lead_capture_popup_disclosure) between 1 and 600)
 );

alter table public.business_website_settings
 add constraint business_website_settings_lead_capture_popup_service_fk
 foreign key (business_id,lead_capture_popup_service_id)
 references public.services(business_id,id)
 on delete set null
 not valid;

alter table public.business_website_settings
 add constraint business_website_settings_lead_capture_popup_inventory_fk
 foreign key (business_id,lead_capture_popup_inventory_item_id)
 references public.inventory_items(business_id,id)
 on delete set null
 not valid;

create table if not exists public.website_discount_leads(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null,
 website_id uuid not null,
 customer_id uuid,
 email text not null,
 normalized_email text generated always as (lower(btrim(email))) stored,
 source text not null default 'website_discount_popup' check (source = 'website_discount_popup'),
 lead_label text not null default 'Website Lead',
 offer_headline text,
 offer_summary text,
 offer_discount_type text,
 offer_discount_value integer,
 offer_custom_text text,
 coupon_code text,
 discount_id uuid references public.discounts(id) on delete set null,
 service_id uuid,
 inventory_item_id uuid,
 minimum_subtotal_cents integer,
 page_url text,
 landing_path text,
 referrer text,
 utm_source text,
 utm_medium text,
 utm_campaign text,
 utm_content text,
 utm_term text,
 gclid text,
 gbraid text,
 wbraid text,
 marketing_consent_granted boolean not null default false,
 marketing_consented_at timestamptz,
 consent_disclosure text,
 consent_version text,
 submitted_ip_hash text,
 user_agent text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(business_id, normalized_email),
 foreign key (business_id,website_id) references public.business_website_settings(business_id,id) on delete cascade,
 foreign key (business_id,customer_id) references public.customers(business_id,id) on delete set null,
 foreign key (business_id,service_id) references public.services(business_id,id) on delete set null,
 foreign key (business_id,inventory_item_id) references public.inventory_items(business_id,id) on delete set null,
 check (email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 check (offer_discount_type is null or offer_discount_type in ('fixed','percentage','custom')),
 check (offer_discount_value is null or offer_discount_value > 0),
 check (minimum_subtotal_cents is null or minimum_subtotal_cents >= 0),
 check (marketing_consent_granted = false or marketing_consented_at is not null)
);

create index if not exists website_discount_leads_business_created_idx
 on public.website_discount_leads(business_id, created_at desc);
create index if not exists website_discount_leads_business_consent_idx
 on public.website_discount_leads(business_id, marketing_consent_granted, created_at desc);
create index if not exists website_discount_leads_business_customer_idx
 on public.website_discount_leads(business_id, customer_id)
 where customer_id is not null;

alter table public.website_discount_leads enable row level security;
create policy "members read website discount leads"
 on public.website_discount_leads
 for select
 to authenticated
 using (public.is_business_member(business_id));

create policy "admins manage website discount leads"
 on public.website_discount_leads
 for all
 to authenticated
 using (public.has_business_role(business_id, array['owner','admin','manager']))
 with check (public.has_business_role(business_id, array['owner','admin','manager']));

create trigger website_discount_leads_updated_at
 before update on public.website_discount_leads
 for each row execute function public.set_routing_updated_at();

comment on table public.website_discount_leads is 'Tenant-scoped website popup email leads captured from public Servonas-hosted websites and linked back to CRM customers when possible.';

notify pgrst, 'reload schema';
commit;
