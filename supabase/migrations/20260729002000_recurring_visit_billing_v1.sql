-- Recurring visit billing v1.
-- Extends the Epic 6 financial ledger; it does not create a second invoice or
-- payment model. All monetary values introduced here are integer cents.
begin;

create table public.business_billing_settings(
  business_id uuid primary key references public.businesses(id) on delete cascade,
  invoice_prefix text not null default 'INV-' check(length(invoice_prefix) between 1 and 12),
  invoice_next_number bigint not null default 1001 check(invoice_next_number>0),
  invoice_minimum_digits smallint not null default 4 check(invoice_minimum_digits between 1 and 12),
  default_payment_terms_days integer not null default 30 check(default_payment_terms_days between 0 and 365),
  default_billing_method text not null default 'invoice_after_completion'
    check(default_billing_method in('auto_charge_after_completion','invoice_after_completion','manual_billing')),
  default_invoice_delivery text not null default 'email' check(default_invoice_delivery in('email','manual')),
  review_before_processing boolean not null default true,
  automatic_payment_retries boolean not null default false,
  maximum_automatic_retries smallint not null default 0 check(maximum_automatic_retries between 0 and 10),
  tax_enabled boolean not null default false,
  default_tax_rate_basis_points integer not null default 0 check(default_tax_rate_basis_points between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.business_billing_settings(business_id,default_tax_rate_basis_points,tax_enabled)
select id,least(10000,greatest(0,round(coalesce(tax_rate,0)*100)::integer)),coalesce(tax_rate,0)>0
from public.businesses on conflict(business_id) do nothing;

-- Start after any invoice numbers already issued with the default prefix.
update public.business_billing_settings s
set invoice_next_number=greatest(
  s.invoice_next_number,
  coalesce((
    select max(substring(i.invoice_number from '([0-9]+)$')::bigint)+1
    from public.invoices i
    where i.business_id=s.business_id
      and i.invoice_number ~ '[0-9]+$'
  ),s.invoice_next_number)
);

create table public.customer_billing_profiles(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  use_business_defaults boolean not null default true,
  billing_method text check(billing_method is null or billing_method in('auto_charge_after_completion','invoice_after_completion','manual_billing')),
  payment_terms_days integer check(payment_terms_days is null or payment_terms_days between 0 and 365),
  auto_send_invoice boolean,
  autopay_enabled boolean not null default false,
  provider text check(provider is null or provider='stripe'),
  provider_customer_id text,
  default_payment_method_id uuid,
  billing_email text,
  billing_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique(business_id,id),
  unique(business_id,customer_id),
  foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade,
  check(not autopay_enabled or provider_customer_id is not null)
);

create table public.customer_payment_methods(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  provider text not null check(provider='stripe'),
  provider_customer_id text not null,
  provider_payment_method_id text not null,
  method_type text not null default 'card' check(method_type in('card','bank_account','other')),
  brand text,last_four text check(last_four is null or last_four ~ '^[0-9]{4}$'),
  expiration_month smallint check(expiration_month is null or expiration_month between 1 and 12),
  expiration_year smallint,
  is_default boolean not null default false,
  status text not null default 'active' check(status in('active','expired','detached')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(business_id,id),
  unique(business_id,provider,provider_payment_method_id),
  foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade
);
create unique index customer_payment_methods_one_default
  on public.customer_payment_methods(business_id,customer_id) where is_default and status='active';
alter table public.customer_billing_profiles add constraint customer_billing_default_method_fk
  foreign key(business_id,default_payment_method_id) references public.customer_payment_methods(business_id,id);

alter table public.recurring_service_series
  add column if not exists billing_method text,
  add column if not exists payment_terms_days integer,
  add column if not exists auto_send_invoice boolean not null default false,
  add column if not exists auto_charge_enabled boolean not null default false,
  add column if not exists use_customer_billing_defaults boolean not null default true;
alter table public.recurring_service_series drop constraint if exists recurring_service_series_billing_method_check;
alter table public.recurring_service_series add constraint recurring_service_series_billing_method_check
  check(billing_method is null or billing_method in('auto_charge_after_completion','invoice_after_completion','manual_billing'));
alter table public.recurring_service_series drop constraint if exists recurring_service_series_payment_terms_check;
alter table public.recurring_service_series add constraint recurring_service_series_payment_terms_check
  check(payment_terms_days is null or payment_terms_days between 0 and 365);
alter table public.recurring_service_series drop constraint if exists recurring_service_series_autopay_check;
alter table public.recurring_service_series add constraint recurring_service_series_autopay_check
  check(not auto_charge_enabled or billing_method='auto_charge_after_completion' or use_customer_billing_defaults);

create table public.job_pricing_snapshots(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null,
  service_plan_id uuid,
  occurrence_type text not null check(occurrence_type in('initial','recurring','manual','follow_up')),
  service_id uuid,
  service_description text not null,
  quantity numeric(14,4) not null default 1 check(quantity>0),
  unit_price_cents bigint not null check(unit_price_cents>=0),
  discount_cents bigint not null default 0 check(discount_cents>=0),
  fee_cents bigint not null default 0 check(fee_cents>=0),
  taxable boolean not null default false,
  tax_rate_basis_points integer not null default 0 check(tax_rate_basis_points between 0 and 10000),
  billing_method text not null check(billing_method in('auto_charge_after_completion','invoice_after_completion','manual_billing')),
  payment_terms_days integer not null check(payment_terms_days between 0 and 365),
  auto_send_invoice boolean not null default false,
  price_effective_date date not null,
  source_snapshot jsonb not null default '{}' check(jsonb_typeof(source_snapshot)='object'),
  created_at timestamptz not null default now(),
  unique(business_id,id),
  unique(business_id,job_id),
  foreign key(business_id,job_id) references public.jobs(business_id,id) on delete restrict,
  foreign key(business_id,service_plan_id) references public.recurring_service_series(business_id,id) on delete restrict,
  foreign key(business_id,service_id) references public.services(business_id,id) on delete restrict
);

alter table public.invoices
  add column if not exists service_plan_id uuid,
  add column if not exists job_pricing_snapshot_id uuid,
  add column if not exists billing_method_snapshot text,
  add column if not exists auto_charge_attempted_at timestamptz;
alter table public.invoices add constraint invoices_service_plan_billing_fk
  foreign key(business_id,service_plan_id) references public.recurring_service_series(business_id,id);
alter table public.invoices add constraint invoices_job_pricing_snapshot_fk
  foreign key(business_id,job_pricing_snapshot_id) references public.job_pricing_snapshots(business_id,id);
alter table public.invoices drop constraint if exists invoices_billing_method_snapshot_check;
alter table public.invoices add constraint invoices_billing_method_snapshot_check
  check(billing_method_snapshot is null or billing_method_snapshot in('auto_charge_after_completion','invoice_after_completion','manual_billing'));
create unique index invoices_one_active_per_job on public.invoices(business_id,job_id)
  where job_id is not null and not is_deleted;

create table public.payment_attempts(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null,
  payment_id uuid,
  payment_method_id uuid,
  attempt_number smallint not null default 1 check(attempt_number>0),
  idempotency_key text not null,
  status text not null check(status in('pending','succeeded','failed','canceled')),
  provider text not null default 'stripe' check(provider='stripe'),
  provider_payment_intent_id text,
  failure_code text,
  failure_reason text,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(business_id,id),
  unique(business_id,idempotency_key),
  foreign key(business_id,invoice_id) references public.invoices(business_id,id) on delete restrict,
  foreign key(business_id,payment_id) references public.payments(business_id,id),
  foreign key(business_id,payment_method_id) references public.customer_payment_methods(business_id,id)
);

create table public.billing_audit_events(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid,
  service_plan_id uuid,
  job_id uuid,
  invoice_id uuid,
  payment_id uuid,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  foreign key(business_id,customer_id) references public.customers(business_id,id),
  foreign key(business_id,service_plan_id) references public.recurring_service_series(business_id,id),
  foreign key(business_id,job_id) references public.jobs(business_id,id),
  foreign key(business_id,invoice_id) references public.invoices(business_id,id),
  foreign key(business_id,payment_id) references public.payments(business_id,id)
);
create index billing_audit_timeline on public.billing_audit_events(business_id,customer_id,created_at desc);

create or replace view public.customer_billing_balances
with(security_invoker=true) as
select c.business_id,c.id customer_id,
 coalesce(sum(i.balance_due_cents) filter(where i.status in('ready','sent','viewed','partially_paid','overdue','past_due')),0)::bigint outstanding_balance_cents,
 coalesce(sum(i.balance_due_cents) filter(where i.status in('overdue','past_due') or (i.due_date<current_date and i.balance_due_cents>0)),0)::bigint past_due_balance_cents,
 coalesce(sum(i.amount_paid_cents-i.amount_refunded_cents),0)::bigint lifetime_net_payments_cents
from public.customers c left join public.invoices i on i.business_id=c.business_id and i.customer_id=c.id and not i.is_deleted
where not c.is_deleted group by c.business_id,c.id;

alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check check(status in(
 'draft','ready','sent','viewed','partially_paid','paid','past_due','overdue','void',
 'uncollectible','refunded'
));

create or replace function public.capture_job_pricing_snapshot(p_job_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare j public.jobs%rowtype;p public.recurring_service_series%rowtype;o public.service_plan_occurrences%rowtype;
 b public.business_billing_settings%rowtype;cb public.customer_billing_profiles%rowtype;
 v_id uuid;v_type text;v_method text;v_terms integer;v_send boolean;v_price bigint;v_description text;v_tax integer;
begin
 select * into j from public.jobs where id=p_job_id and not is_deleted;
 if not found then raise exception 'Job not found' using errcode='P0002';end if;
 select id into v_id from public.job_pricing_snapshots where business_id=j.business_id and job_id=j.id;
 if v_id is not null then return v_id;end if;
 if j.recurring_service_series_id is null then return null;end if;
 select * into p from public.recurring_service_series where id=j.recurring_service_series_id and business_id=j.business_id;
 if not found then raise exception 'Service plan not found' using errcode='23503';end if;
 if j.service_plan_occurrence_id is not null then select * into o from public.service_plan_occurrences where id=j.service_plan_occurrence_id and business_id=j.business_id;end if;
 select * into b from public.business_billing_settings where business_id=j.business_id;
 select * into cb from public.customer_billing_profiles where business_id=j.business_id and customer_id=j.customer_id;
 v_type:=coalesce(o.occurrence_type,case when j.generation_type='initial' then 'initial' else 'recurring' end);
 v_price:=round((case when v_type='initial' then p.initial_service_price else p.recurring_price end)*100);
 v_description:=coalesce(case when v_type='initial' then p.initial_service_description end,p.name,j.title,'Service');
 v_method:=case when p.use_customer_billing_defaults then coalesce(cb.billing_method,b.default_billing_method,'invoice_after_completion') else coalesce(p.billing_method,'invoice_after_completion') end;
 v_terms:=case when p.use_customer_billing_defaults then coalesce(cb.payment_terms_days,b.default_payment_terms_days,30) else coalesce(p.payment_terms_days,30) end;
 v_send:=case when p.use_customer_billing_defaults then coalesce(cb.auto_send_invoice,not coalesce(b.review_before_processing,true)) else p.auto_send_invoice end;
 v_tax:=case when coalesce(b.tax_enabled,false) then coalesce(b.default_tax_rate_basis_points,0) else 0 end;
 insert into public.job_pricing_snapshots(business_id,job_id,service_plan_id,occurrence_type,service_id,service_description,
  unit_price_cents,discount_cents,fee_cents,taxable,tax_rate_basis_points,billing_method,payment_terms_days,
  auto_send_invoice,price_effective_date,source_snapshot)
 values(j.business_id,j.id,p.id,v_type,j.service_id,v_description,v_price,round(p.default_discount*100),round(p.default_fee*100),
  p.taxable,v_tax,v_method,v_terms,v_send,coalesce(j.occurrence_date,current_date),
  jsonb_build_object('service_plan_name',p.name,'initial_service_price',p.initial_service_price,
   'recurring_price',p.recurring_price,'billing_method',v_method,'captured_at',now()))
 returning id into v_id;
 insert into public.billing_audit_events(business_id,customer_id,service_plan_id,job_id,event_type,actor_user_id,metadata)
 values(j.business_id,j.customer_id,p.id,j.id,'job_pricing_snapshotted',auth.uid(),jsonb_build_object('snapshot_id',v_id));
 return v_id;
end$$;

create or replace function public.capture_generated_job_pricing()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.recurring_service_series_id is not null then perform public.capture_job_pricing_snapshot(new.id);end if;
 return new;
end$$;
drop trigger if exists jobs_capture_pricing_snapshot on public.jobs;
create trigger jobs_capture_pricing_snapshot after insert or update of recurring_service_series_id,service_plan_occurrence_id
on public.jobs for each row execute function public.capture_generated_job_pricing();

create or replace function public.create_completed_job_invoice(p_job_id uuid)
returns table(invoice_id uuid,billing_method text,auto_send boolean)
language plpgsql security definer set search_path=public as $$
declare j public.jobs%rowtype;s public.job_pricing_snapshots%rowtype;b public.business_billing_settings%rowtype;
 v_invoice uuid;v_number text;v_value bigint;v_prefix text;v_digits integer;
 v_sub bigint;v_discount bigint;v_fee bigint;v_taxable bigint;v_tax bigint;v_total bigint;v_issue date;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_job_id::text,0));
 select * into j from public.jobs where id=p_job_id and not is_deleted for update;
 if not found or j.status<>'completed' then raise exception 'Only a completed job can be billed' using errcode='23514';end if;
 select i.id,i.billing_method_snapshot,coalesce(s.auto_send_invoice,false) into v_invoice,billing_method,auto_send
 from public.invoices i left join public.job_pricing_snapshots s on s.id=i.job_pricing_snapshot_id and s.business_id=i.business_id
 where i.business_id=j.business_id and i.job_id=j.id and not i.is_deleted;
 if v_invoice is not null then invoice_id:=v_invoice;return next;return;end if;
 perform public.capture_job_pricing_snapshot(j.id);
 select * into s from public.job_pricing_snapshots where business_id=j.business_id and job_id=j.id;
 if not found then raise exception 'Completed job has no pricing snapshot' using errcode='23514';end if;
 select * into b from public.business_billing_settings where business_id=j.business_id;
 v_prefix:=coalesce(b.invoice_prefix,'INV-');v_digits:=coalesce(b.invoice_minimum_digits,4);
 update public.business_billing_settings set invoice_next_number=invoice_next_number+1,updated_at=now()
 where business_id=j.business_id returning invoice_next_number-1 into v_value;
 v_number:=v_prefix||lpad(v_value::text,v_digits,'0');
 v_sub:=round(s.quantity*s.unit_price_cents);v_discount:=least(v_sub,s.discount_cents);v_fee:=s.fee_cents;
 v_taxable:=case when s.taxable then v_sub-v_discount+v_fee else 0 end;
 v_tax:=round(v_taxable*s.tax_rate_basis_points/10000.0);v_total:=v_sub-v_discount+v_fee+v_tax;
 v_issue:=(now() at time zone coalesce((select timezone from public.businesses where id=j.business_id),'UTC'))::date;
 insert into public.invoices(business_id,invoice_number,customer_id,service_location_id,job_id,service_plan_id,
  job_pricing_snapshot_id,billing_method_snapshot,status,title,currency,subtotal_cents,discount_total_cents,
  tax_total_cents,fee_total_cents,grand_total_cents,balance_due_cents,issue_date,due_date,source_key,created_by,updated_by)
 values(j.business_id,v_number,j.customer_id,j.service_location_id,j.id,s.service_plan_id,s.id,s.billing_method,'draft',
  s.service_description,'USD',v_sub,v_discount,v_tax,v_fee,v_total,v_total,v_issue,v_issue+s.payment_terms_days,j.id,auth.uid(),auth.uid())
 returning id into v_invoice;
 insert into public.invoice_line_items(business_id,invoice_id,service_id,name_snapshot,description_snapshot,quantity,
  unit_type_snapshot,unit_price_cents,discount_type,discount_value,line_discount_cents,is_taxable,
  tax_rate_basis_points,line_subtotal_cents,tax_amount_cents,line_total_cents)
 values(j.business_id,v_invoice,s.service_id,s.service_description,null,s.quantity,'visit',s.unit_price_cents,
  case when v_discount>0 then 'fixed' else 'none' end,v_discount,v_discount,s.taxable,s.tax_rate_basis_points,
  v_sub,v_tax,v_total-v_fee);
 insert into public.invoice_fees(business_id,invoice_id,name_snapshot,amount_cents,sort_order)
 select j.business_id,v_invoice,'Service fee',v_fee,0 where v_fee>0;
 insert into public.invoice_events(business_id,invoice_id,event_type,actor_user_id,metadata)
 values(j.business_id,v_invoice,'created',auth.uid(),jsonb_build_object('source','completed_service_plan_job','pricing_snapshot_id',s.id));
 insert into public.billing_audit_events(business_id,customer_id,service_plan_id,job_id,invoice_id,event_type,actor_user_id,metadata)
 values(j.business_id,j.customer_id,s.service_plan_id,j.id,v_invoice,'completed_job_invoice_created',auth.uid(),jsonb_build_object('billing_method',s.billing_method));
 invoice_id:=v_invoice;billing_method:=s.billing_method;auto_send:=s.auto_send_invoice;return next;
end$$;

create or replace function public.bill_completed_job_trigger()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.status='completed' and old.status is distinct from 'completed' and new.recurring_service_series_id is not null then
  perform public.create_completed_job_invoice(new.id);
 end if;
 return new;
end$$;
drop trigger if exists jobs_bill_completed_recurring_visit on public.jobs;
create trigger jobs_bill_completed_recurring_visit after update of status on public.jobs
for each row execute function public.bill_completed_job_trigger();

alter table public.business_billing_settings enable row level security;
alter table public.customer_billing_profiles enable row level security;
alter table public.customer_payment_methods enable row level security;
alter table public.job_pricing_snapshots enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.billing_audit_events enable row level security;
create policy "office manages business billing settings" on public.business_billing_settings for all to authenticated
 using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "office manages customer billing profiles" on public.customer_billing_profiles for all to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "office manages customer payment references" on public.customer_payment_methods for all to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "office reads job pricing snapshots" on public.job_pricing_snapshots for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager']) or public.is_assigned_technician(business_id,job_id));
create policy "office reads payment attempts" on public.payment_attempts for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "office reads billing audit" on public.billing_audit_events for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager']));

-- These functions run from trusted database triggers or the server-side
-- service-role orchestrator. They are deliberately not callable by a browser.
revoke all on function public.capture_job_pricing_snapshot(uuid) from public,authenticated;
revoke all on function public.create_completed_job_invoice(uuid) from public,authenticated;
grant execute on function public.capture_job_pricing_snapshot(uuid) to service_role;
grant execute on function public.create_completed_job_invoice(uuid) to service_role;

commit;
