begin;
alter table public.discounts add column tiers jsonb not null default '[]'::jsonb;
-- The application validates discount progression using the canonical TypeScript calculator.
-- Database constraints also protect the JSON shape and uniqueness of thresholds/IDs.
create function public.valid_discount_tier_structure(value jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
declare tier jsonb; thresholds bigint[]='{}'; ids text[]='{}'; threshold bigint; amount bigint;
begin
 if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>50 then return false; end if;
 for tier in select * from jsonb_array_elements(value) loop
  if jsonb_typeof(tier)<>'object' or not(tier ?& array['id','minimum_subtotal_cents','discount_type','discount_value']) then return false; end if;
  if jsonb_typeof(tier->'id')<>'string' or length(tier->>'id') not between 1 and 80 or (tier->>'id')=any(ids) then return false; end if;
  if jsonb_typeof(tier->'minimum_subtotal_cents')<>'number' or jsonb_typeof(tier->'discount_value')<>'number' or (tier->>'minimum_subtotal_cents') !~ '^[0-9]+$' or (tier->>'discount_value') !~ '^[0-9]+$' then return false; end if;
  threshold=(tier->>'minimum_subtotal_cents')::bigint; amount=(tier->>'discount_value')::bigint;
  if threshold<0 or threshold>2147483647 or threshold=any(thresholds) or amount<=0 or amount>2147483647 then return false; end if;
  if jsonb_typeof(tier->'discount_type')<>'string' or tier->>'discount_type' not in ('fixed','percentage') or (tier->>'discount_type'='percentage' and amount>10000) then return false; end if;
  thresholds=array_append(thresholds,threshold); ids=array_append(ids,tier->>'id');
 end loop;
 return true;
exception when others then return false;
end;$$;
alter table public.discounts add constraint discounts_tiers_valid check(public.valid_discount_tier_structure(tiers));
alter table public.bookings add column discount_snapshot jsonb;
alter table public.jobs add column discount_snapshot jsonb;
alter table public.invoices add column discount_snapshot jsonb;
comment on column public.bookings.discount_snapshot is 'Checkout promotion identity, selected tier ID/threshold/type/value, qualifying and eligible rental subtotals, and actual savings. Retained when the promotion is edited.';
-- Office jobs and invoices participate in the same usage limits as public bookings.
alter table public.discount_redemptions add column job_id uuid references public.jobs(id) on delete cascade,
 add column invoice_id uuid references public.invoices(id) on delete cascade;
create unique index discount_redemptions_job_unique on public.discount_redemptions(business_id,job_id) where job_id is not null;
create unique index discount_redemptions_invoice_unique on public.discount_redemptions(business_id,invoice_id) where invoice_id is not null;
create function public.record_office_discount_redemption() returns trigger
language plpgsql security definer set search_path=public as $$
declare row_data jsonb=to_jsonb(new); prior jsonb; snapshot jsonb; rule public.discounts%rowtype;
 existing_id uuid; target_discount uuid; source_job uuid; uses integer; customer_uses integer;
begin
 snapshot=row_data->'discount_snapshot';
 if tg_op='UPDATE' then prior=to_jsonb(old); end if;
 select id into existing_id from public.discount_redemptions where business_id=new.business_id
  and ((tg_table_name='jobs' and job_id=new.id) or (tg_table_name='invoices' and invoice_id=new.id));
 if snapshot is null or snapshot='null'::jsonb or coalesce((row_data->>'is_deleted')::boolean,false) or row_data->>'status' in ('canceled','void') then
  if existing_id is not null then update public.discount_redemptions set status='voided' where id=existing_id; end if;
  return new;
 end if;
 if prior is not null and prior->'discount_snapshot'=snapshot and prior->'customer_id'=row_data->'customer_id' and prior->'is_deleted'=row_data->'is_deleted' and prior->>'status' not in ('canceled','void') then return new; end if;
 -- A website booking already owns its redemption before its job is created.
 if tg_table_name='jobs' and exists(select 1 from public.bookings b where b.business_id=new.business_id and b.id::text=row_data->>'request_key') then return new; end if;
 target_discount=(snapshot->>'discountId')::uuid;
 -- Completion invoices carry forward the job/booking redemption, without using the offer twice.
 if tg_table_name='invoices' then
  source_job=nullif(row_data->>'job_id','')::uuid;
  if source_job is not null and (exists(select 1 from public.discount_redemptions where business_id=new.business_id and job_id=source_job and discount_id=target_discount and status in ('pending','redeemed'))
    or exists(select 1 from public.bookings where business_id=new.business_id and job_id=source_job and discount_id=target_discount)) then return new; end if;
 end if;
 select * into rule from public.discounts where id=target_discount and business_id=new.business_id for update;
 if not found or not rule.is_active or (rule.starts_at is not null and rule.starts_at>now()) or (rule.expires_at is not null and rule.expires_at<=now()) then raise exception 'Promotion is unavailable'; end if;
 select count(*),count(*) filter(where customer_id=new.customer_id) into uses,customer_uses
 from public.discount_redemptions where discount_id=rule.id and status in ('pending','redeemed') and (existing_id is null or id<>existing_id);
 if rule.usage_limit is not null and uses>=rule.usage_limit then raise exception 'Promotion usage limit reached'; end if;
 if rule.per_customer_limit is not null and customer_uses>=rule.per_customer_limit then raise exception 'Promotion customer limit reached'; end if;
 if existing_id is null then
  insert into public.discount_redemptions(business_id,discount_id,customer_id,job_id,invoice_id,amount_discounted_cents,status,redeemed_at)
  values(new.business_id,rule.id,new.customer_id,case when tg_table_name='jobs' then new.id end,case when tg_table_name='invoices' then new.id end,(snapshot->>'discountCents')::integer,'redeemed',now());
 else
  update public.discount_redemptions set discount_id=rule.id,customer_id=new.customer_id,amount_discounted_cents=(snapshot->>'discountCents')::integer,status='redeemed',redeemed_at=now() where id=existing_id;
 end if;
 return new;
end;$$;
create trigger jobs_promotion_redemption after insert or update of discount_snapshot,customer_id,is_deleted,status on public.jobs for each row execute function public.record_office_discount_redemption();
create trigger invoices_promotion_redemption after insert or update of discount_snapshot,customer_id,is_deleted,status on public.invoices for each row execute function public.record_office_discount_redemption();
notify pgrst,'reload schema';
commit;
