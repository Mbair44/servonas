begin;

create or replace function public.validate_google_review_tenant_links()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
 if tg_table_name='google_review_customer_matches' then
  if not exists(select 1 from public.google_reviews r where r.id=new.review_id and r.business_id=new.business_id)
    or not exists(select 1 from public.customers c where c.id=new.customer_id and c.business_id=new.business_id) then
   raise exception 'Review match tenant mismatch' using errcode='23503';
  end if;
 elsif tg_table_name='customer_review_overrides' then
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.business_id=new.business_id)
    or (new.google_location_id is not null and not exists(select 1 from public.business_google_locations l where l.id=new.google_location_id and l.business_id=new.business_id)) then
   raise exception 'Review override tenant mismatch' using errcode='23503';
  end if;
 end if;
 return new;
end;
$$;

notify pgrst,'reload schema';
commit;
