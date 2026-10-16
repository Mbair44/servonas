begin;

create table if not exists public.job_addon_catalog (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 160),
 description text, default_unit_price_cents bigint not null check(default_unit_price_cents>=0),
 is_taxable boolean not null default true, visibility text not null default 'admin_only' check(visibility in('admin_only','public_future')),
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,name)
);
create table if not exists public.job_addons (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 job_id uuid not null references public.jobs(id) on delete cascade, booking_id uuid references public.bookings(id) on delete set null,
 catalog_id uuid references public.job_addon_catalog(id) on delete set null, name_snapshot text not null, description_snapshot text,
 quantity integer not null default 1 check(quantity between 1 and 10000), unit_price_cents bigint not null check(unit_price_cents>=0),
 is_taxable boolean not null default true, tax_rate_basis_points integer not null default 0 check(tax_rate_basis_points between 0 and 100000),
 subtotal_cents bigint not null check(subtotal_cents>=0), tax_cents bigint not null default 0 check(tax_cents>=0), total_cents bigint not null check(total_cents>=0),
 created_by uuid references auth.users(id), updated_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(business_id,id)
);
create table if not exists public.booking_charge_lines (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 booking_id uuid not null references public.bookings(id) on delete cascade, job_addon_id uuid unique references public.job_addons(id) on delete cascade,
 line_type text not null check(line_type='job_addon'), name_snapshot text not null, description_snapshot text, quantity integer not null check(quantity>0), unit_price_cents bigint not null check(unit_price_cents>=0), subtotal_cents bigint not null check(subtotal_cents>=0), tax_cents bigint not null default 0 check(tax_cents>=0), total_cents bigint not null check(total_cents>=0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(business_id,id)
);
alter table public.invoice_line_items add column if not exists job_addon_id uuid references public.job_addons(id) on delete set null;
create unique index if not exists invoice_line_items_job_addon_unique on public.invoice_line_items(job_addon_id) where job_addon_id is not null;
create table if not exists public.job_addon_audit_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, job_id uuid not null references public.jobs(id) on delete cascade,
 addon_id uuid references public.job_addons(id) on delete set null, action text not null check(action in('created','updated','removed')), actor_user_id uuid references auth.users(id), before_values jsonb not null default '{}'::jsonb, after_values jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists job_addons_job_idx on public.job_addons(business_id,job_id,created_at);
create index if not exists booking_charge_lines_booking_idx on public.booking_charge_lines(business_id,booking_id,created_at);
alter table public.job_addon_catalog enable row level security; alter table public.job_addons enable row level security; alter table public.booking_charge_lines enable row level security; alter table public.job_addon_audit_events enable row level security;
create policy "members read job addon catalog" on public.job_addon_catalog for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage job addon catalog" on public.job_addon_catalog for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members read job addons" on public.job_addons for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage job addons" on public.job_addons for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members read booking charge lines" on public.booking_charge_lines for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage booking charge lines" on public.booking_charge_lines for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members read job addon audit" on public.job_addon_audit_events for select to authenticated using(public.is_business_member(business_id));

-- This is the only write path used by the office UI.  It locks the linked
-- booking while it changes both job and booking totals, so a saved add-on can
-- never race a balance-payment calculation.
create or replace function public.save_job_addon(
 p_business_id uuid,p_job_id uuid,p_addon_id uuid,p_catalog_id uuid,p_name text,p_description text,
 p_quantity integer,p_unit_price_cents bigint,p_is_taxable boolean
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_job public.jobs%rowtype; v_booking public.bookings%rowtype; v_old public.job_addons%rowtype;
 v_catalog public.job_addon_catalog%rowtype; v_rate integer:=0; v_subtotal bigint; v_tax bigint; v_total bigint;
 v_old_subtotal bigint:=0; v_old_tax bigint:=0; v_old_total bigint:=0; v_addon public.job_addons%rowtype;
 v_balance bigint; v_before jsonb; v_action text; v_invoice record;
begin
 if auth.uid() is null or not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_quantity is null or p_quantity<1 or p_quantity>10000 or p_unit_price_cents is null or p_unit_price_cents<0 or length(btrim(coalesce(p_name,'')))=0 then raise exception 'Invalid add-on' using errcode='22023'; end if;
 select * into v_job from public.jobs where id=p_job_id and business_id=p_business_id and not is_deleted for update;
 if not found then raise exception 'Job not found' using errcode='P0002'; end if;
 select * into v_booking from public.bookings where job_id=p_job_id and business_id=p_business_id for update;
 if p_catalog_id is not null then
   select * into v_catalog from public.job_addon_catalog where id=p_catalog_id and business_id=p_business_id and is_active;
   if not found then raise exception 'Saved add-on not found' using errcode='P0002'; end if;
 end if;
 if p_addon_id is not null then
   select * into v_old from public.job_addons where id=p_addon_id and job_id=p_job_id and business_id=p_business_id for update;
   if not found then raise exception 'Add-on not found' using errcode='P0002'; end if;
   v_old_subtotal:=v_old.subtotal_cents; v_old_tax:=v_old.tax_cents; v_old_total:=v_old.total_cents; v_action:='updated';
 else v_action:='created'; end if;
 -- Booking tax snapshots are immutable.  Reuse their recorded rate for a new
 -- taxable charge; a missing snapshot intentionally yields zero tax rather
 -- than retroactively changing historic rental tax.
 if coalesce(p_is_taxable,true) and v_booking.id is not null then v_rate:=greatest(0,coalesce((v_booking.tax_snapshot->>'taxRateBasisPoints')::integer,0)); end if;
 v_subtotal:=p_quantity*p_unit_price_cents; v_tax:=case when coalesce(p_is_taxable,true) then round(v_subtotal*v_rate/10000.0)::bigint else 0 end; v_total:=v_subtotal+v_tax;
 v_before:=jsonb_build_object('subtotal_cents',v_old_subtotal,'tax_cents',v_old_tax,'total_cents',v_old_total);
 if p_addon_id is null then
   insert into public.job_addons(business_id,job_id,booking_id,catalog_id,name_snapshot,description_snapshot,quantity,unit_price_cents,is_taxable,tax_rate_basis_points,subtotal_cents,tax_cents,total_cents,created_by,updated_by)
   values(p_business_id,p_job_id,v_booking.id,p_catalog_id,btrim(p_name),nullif(btrim(coalesce(p_description,'')),''),p_quantity,p_unit_price_cents,coalesce(p_is_taxable,true),v_rate,v_subtotal,v_tax,v_total,auth.uid(),auth.uid()) returning * into v_addon;
 else
   update public.job_addons set catalog_id=p_catalog_id,name_snapshot=btrim(p_name),description_snapshot=nullif(btrim(coalesce(p_description,'')),''),quantity=p_quantity,unit_price_cents=p_unit_price_cents,is_taxable=coalesce(p_is_taxable,true),tax_rate_basis_points=v_rate,subtotal_cents=v_subtotal,tax_cents=v_tax,total_cents=v_total,updated_by=auth.uid(),updated_at=now() where id=p_addon_id returning * into v_addon;
 end if;
 if v_booking.id is not null then
   v_balance:=greatest(0,coalesce(v_booking.balance_due_cents,0)-v_old_total+v_total);
   update public.bookings set subtotal_cents=greatest(0,coalesce(subtotal_cents,0)-v_old_subtotal+v_subtotal),tax_cents=greatest(0,coalesce(tax_cents,0)-v_old_tax+v_tax),total_cents=greatest(0,coalesce(total_cents,0)-v_old_total+v_total),balance_due_cents=v_balance,balance_charge_scheduled_for=case when v_balance=0 then null else balance_charge_scheduled_for end,updated_at=now() where id=v_booking.id;
   insert into public.booking_charge_lines(business_id,booking_id,job_addon_id,line_type,name_snapshot,description_snapshot,quantity,unit_price_cents,subtotal_cents,tax_cents,total_cents)
   values(p_business_id,v_booking.id,v_addon.id,'job_addon',v_addon.name_snapshot,v_addon.description_snapshot,v_addon.quantity,v_addon.unit_price_cents,v_subtotal,v_tax,v_total)
   on conflict(job_addon_id) do update set name_snapshot=excluded.name_snapshot,description_snapshot=excluded.description_snapshot,quantity=excluded.quantity,unit_price_cents=excluded.unit_price_cents,subtotal_cents=excluded.subtotal_cents,tax_cents=excluded.tax_cents,total_cents=excluded.total_cents,updated_at=now();
   select id,status into v_invoice from public.invoices where business_id=p_business_id and job_id=p_job_id and not is_deleted and status<>'void' order by created_at desc limit 1;
   if v_invoice.id is not null and v_invoice.status='draft' then
     insert into public.invoice_line_items(business_id,invoice_id,job_addon_id,name_snapshot,description_snapshot,quantity,unit_type_snapshot,unit_price_cents,is_taxable,tax_rate_basis_points,line_subtotal_cents,tax_amount_cents,line_total_cents,sort_order)
     values(p_business_id,v_invoice.id,v_addon.id,v_addon.name_snapshot,v_addon.description_snapshot,v_addon.quantity,'item',v_addon.unit_price_cents,v_addon.is_taxable,v_rate,v_subtotal,v_tax,v_total,900)
     on conflict(job_addon_id) do update set name_snapshot=excluded.name_snapshot,description_snapshot=excluded.description_snapshot,quantity=excluded.quantity,unit_price_cents=excluded.unit_price_cents,is_taxable=excluded.is_taxable,tax_rate_basis_points=excluded.tax_rate_basis_points,line_subtotal_cents=excluded.line_subtotal_cents,tax_amount_cents=excluded.tax_amount_cents,line_total_cents=excluded.line_total_cents,updated_at=now();
     update public.invoices set subtotal_cents=greatest(0,subtotal_cents-v_old_subtotal+v_subtotal),tax_total_cents=greatest(0,tax_total_cents-v_old_tax+v_tax),grand_total_cents=greatest(0,grand_total_cents-v_old_total+v_total),balance_due_cents=greatest(0,balance_due_cents-v_old_total+v_total),updated_by=auth.uid(),updated_at=now() where id=v_invoice.id and business_id=p_business_id and status='draft';
   end if;
   insert into public.booking_change_audit(booking_id,business_id,change_source,change_type,old_values,new_values,resulting_total_cents,resulting_balance_due_cents)
   values(v_booking.id,p_business_id,'staff','job_addon_'||v_action,jsonb_build_object('addon_id',v_addon.id,'previous',v_before),jsonb_build_object('addon_id',v_addon.id,'subtotal_cents',v_subtotal,'tax_cents',v_tax,'total_cents',v_total),greatest(0,coalesce(v_booking.total_cents,0)-v_old_total+v_total),v_balance);
 end if;
 update public.jobs set subtotal=greatest(0,coalesce(subtotal,0)+(v_subtotal-v_old_subtotal)/100.0),tax_amount=greatest(0,coalesce(tax_amount,0)+(v_tax-v_old_tax)/100.0),total_amount=greatest(0,coalesce(total_amount,0)+(v_total-v_old_total)/100.0),updated_by=auth.uid(),updated_at=now() where id=p_job_id and business_id=p_business_id;
 insert into public.job_addon_audit_events(business_id,job_id,addon_id,action,actor_user_id,before_values,after_values) values(p_business_id,p_job_id,v_addon.id,v_action,auth.uid(),v_before,to_jsonb(v_addon));
 return to_jsonb(v_addon);
end $$;

create or replace function public.remove_job_addon(p_business_id uuid,p_job_id uuid,p_addon_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_addon public.job_addons%rowtype; v_booking public.bookings%rowtype; v_balance bigint;
begin
 if auth.uid() is null or not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'Permission denied' using errcode='42501'; end if;
 select * into v_addon from public.job_addons where id=p_addon_id and job_id=p_job_id and business_id=p_business_id for update; if not found then raise exception 'Add-on not found' using errcode='P0002'; end if;
 select * into v_booking from public.bookings where id=v_addon.booking_id and business_id=p_business_id for update;
 if v_booking.id is not null then
   v_balance:=greatest(0,coalesce(v_booking.balance_due_cents,0)-v_addon.total_cents);
   update public.bookings set subtotal_cents=greatest(0,subtotal_cents-v_addon.subtotal_cents),tax_cents=greatest(0,tax_cents-v_addon.tax_cents),total_cents=greatest(0,total_cents-v_addon.total_cents),balance_due_cents=v_balance,balance_charge_scheduled_for=case when v_balance=0 then null else balance_charge_scheduled_for end,updated_at=now() where id=v_booking.id;
   delete from public.invoice_line_items where job_addon_id=v_addon.id and business_id=p_business_id and exists(select 1 from public.invoices i where i.id=invoice_id and i.status='draft');
   update public.invoices i set subtotal_cents=greatest(0,i.subtotal_cents-v_addon.subtotal_cents),tax_total_cents=greatest(0,i.tax_total_cents-v_addon.tax_cents),grand_total_cents=greatest(0,i.grand_total_cents-v_addon.total_cents),balance_due_cents=greatest(0,i.balance_due_cents-v_addon.total_cents),updated_by=auth.uid(),updated_at=now() where i.business_id=p_business_id and i.job_id=p_job_id and i.status='draft' and not i.is_deleted;
   insert into public.booking_change_audit(booking_id,business_id,change_source,change_type,old_values,new_values,resulting_total_cents,resulting_balance_due_cents) values(v_booking.id,p_business_id,'staff','job_addon_removed',to_jsonb(v_addon),'{}',greatest(0,v_booking.total_cents-v_addon.total_cents),v_balance);
 end if;
 update public.jobs set subtotal=greatest(0,subtotal-v_addon.subtotal_cents/100.0),tax_amount=greatest(0,tax_amount-v_addon.tax_cents/100.0),total_amount=greatest(0,total_amount-v_addon.total_cents/100.0),updated_by=auth.uid(),updated_at=now() where id=p_job_id and business_id=p_business_id;
 insert into public.job_addon_audit_events(business_id,job_id,addon_id,action,actor_user_id,before_values) values(p_business_id,p_job_id,v_addon.id,'removed',auth.uid(),to_jsonb(v_addon));
 delete from public.job_addons where id=v_addon.id;
end $$;
revoke all on function public.save_job_addon(uuid,uuid,uuid,uuid,text,text,integer,bigint,boolean) from public;
grant execute on function public.save_job_addon(uuid,uuid,uuid,uuid,text,text,integer,bigint,boolean) to authenticated;
revoke all on function public.remove_job_addon(uuid,uuid,uuid) from public;
grant execute on function public.remove_job_addon(uuid,uuid,uuid) to authenticated;

insert into public.job_addon_catalog(business_id,name,description,default_unit_price_cents,is_taxable,visibility,is_active)
select 'cb25acc0-3623-4c06-9041-89a88f4ad6ed','Generator Rental','Admin-only generator rental',15000,true,'admin_only',true
where exists(select 1 from public.businesses where id='cb25acc0-3623-4c06-9041-89a88f4ad6ed')
on conflict(business_id,name) do nothing;

commit;
