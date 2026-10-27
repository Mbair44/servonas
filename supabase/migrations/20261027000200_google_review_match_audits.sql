begin;
create table if not exists public.google_review_match_audits (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 review_id uuid not null references public.google_reviews(id) on delete cascade, customer_id uuid not null references public.customers(id) on delete cascade,
 actor_user_id uuid references auth.users(id) on delete set null, action text not null check(action in ('manually_proposed','confirmed','rejected','removed')),
 previous_status text, next_status text, created_at timestamptz not null default now()
);
create index if not exists google_review_match_audits_review_idx on public.google_review_match_audits(business_id,review_id,created_at desc);
alter table public.google_review_match_audits enable row level security;
create policy "members view review match audits" on public.google_review_match_audits for select to authenticated using(public.is_business_member(business_id));
create policy "owners and admins create review match audits" on public.google_review_match_audits for insert to authenticated with check(public.has_business_role(business_id,array['owner','admin']::text[]));
drop policy if exists "managers manage review matches" on public.google_review_customer_matches;
create policy "owners and admins manage review matches" on public.google_review_customer_matches for all to authenticated using(public.has_business_role(business_id,array['owner','admin']::text[])) with check(public.has_business_role(business_id,array['owner','admin']::text[]));
create or replace function public.validate_google_review_match_audit_tenant() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin if not exists(select 1 from public.google_reviews where id=new.review_id and business_id=new.business_id) or not exists(select 1 from public.customers where id=new.customer_id and business_id=new.business_id) then raise exception 'Review match audit tenant mismatch' using errcode='23503'; end if; return new; end $$;
create trigger google_review_match_audit_tenant_guard before insert on public.google_review_match_audits for each row execute function public.validate_google_review_match_audit_tenant();
notify pgrst,'reload schema';
commit;
