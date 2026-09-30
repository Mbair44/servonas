begin;
alter table public.booking_profitability_snapshots add column if not exists estimated_operating_costs jsonb, add column if not exists estimated_operating_cost_cents bigint check(estimated_operating_cost_cents>=0), add column if not exists estimated_contribution_profit_cents bigint, add column if not exists estimated_costs_complete boolean not null default false, add column if not exists costs_updated_at timestamptz, add column if not exists costs_updated_by uuid;
create table if not exists public.business_rental_profitability_settings(business_id uuid primary key references public.businesses(id) on delete cascade,labor_method text check(labor_method in('fixed','hourly')),labor_fixed_cents integer check(labor_fixed_cents>=0),labor_hourly_cents integer check(labor_hourly_cents>=0),delivery_method text check(delivery_method in('fixed','per_mile','per_drive_hour')),delivery_fixed_cents integer check(delivery_fixed_cents>=0),delivery_per_mile_cents integer check(delivery_per_mile_cents>=0),delivery_per_drive_hour_cents integer check(delivery_per_drive_hour_cents>=0),processing_percent_basis_points integer check(processing_percent_basis_points between 0 and 10000),processing_fixed_cents integer check(processing_fixed_cents>=0),other_fixed_cents integer check(other_fixed_cents>=0),updated_at timestamptz not null default now(),updated_by uuid);
create table if not exists public.booking_profitability_cost_audits(id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id) on delete restrict,business_id uuid not null references public.businesses(id),changed_at timestamptz not null default now(),changed_by uuid,previous_costs jsonb,new_costs jsonb not null,reason text);
alter table public.business_rental_profitability_settings enable row level security; alter table public.booking_profitability_cost_audits enable row level security;
create policy "manage tenant profitability settings" on public.business_rental_profitability_settings for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "read tenant profitability cost audit" on public.booking_profitability_cost_audits for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
grant select,insert,update on public.business_rental_profitability_settings to authenticated; grant select on public.booking_profitability_cost_audits to authenticated; grant all on public.business_rental_profitability_settings,public.booking_profitability_cost_audits to service_role;
drop trigger if exists rental_profitability_job_completed on public.jobs; drop trigger if exists rental_profitability_booking_paid on public.bookings; drop trigger if exists prevent_captured_booking_item_mutation on public.booking_items; drop trigger if exists prevent_captured_reservation_mutation on public.booking_inventory_reservations;
drop function if exists public.finalize_booking_profitability(uuid,uuid,jsonb);
drop function if exists public.rental_inventory_profitability(uuid);
create function public.estimate_booking_operating_costs(p_booking_id uuid,p_revenue_cents bigint)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare b public.bookings%rowtype;j public.jobs%rowtype;s public.business_rental_profitability_settings%rowtype;
 v_labor bigint;v_delivery bigint;v_processing bigint;v_other bigint;v_duration numeric;
begin
 select * into b from bookings where id=p_booking_id; select * into j from jobs where id=b.job_id and business_id=b.business_id;
 select * into s from business_rental_profitability_settings where business_id=b.business_id;
 if not found then return jsonb_build_object('complete',false,'reason','No operating-cost assumptions configured'); end if;
 if s.labor_method='fixed' then v_labor:=s.labor_fixed_cents;
 elsif s.labor_method='hourly' and j.estimated_duration_minutes is not null then v_labor:=round(s.labor_hourly_cents::numeric*j.estimated_duration_minutes/60)::bigint; end if;
 if s.delivery_method='fixed' then v_delivery:=s.delivery_fixed_cents;
 elsif s.delivery_method='per_mile' and b.delivery_distance_miles is not null then v_delivery:=round(s.delivery_per_mile_cents::numeric*b.delivery_distance_miles)::bigint;
 elsif s.delivery_method='per_drive_hour' then v_duration:=nullif(b.delivery_provider_metadata->>'durationSeconds','')::numeric; if v_duration is not null then v_delivery:=round(s.delivery_per_drive_hour_cents::numeric*v_duration/3600)::bigint; end if; end if;
 if s.processing_percent_basis_points is not null and s.processing_fixed_cents is not null then v_processing:=round(p_revenue_cents::numeric*s.processing_percent_basis_points/10000)::bigint+s.processing_fixed_cents; end if;
 v_other:=s.other_fixed_cents;
 if v_labor is null or v_delivery is null or v_processing is null or v_other is null then
  return jsonb_build_object('complete',false,'labor',v_labor,'delivery',v_delivery,'processingFees',v_processing,'other',v_other,'reason','One or more operating-cost assumptions are not configured or lack booking data');
 end if;
 return jsonb_build_object('complete',true,'labor',v_labor,'delivery',v_delivery,'processingFees',v_processing,'other',v_other,'totalCents',v_labor+v_delivery+v_processing+v_other,'source','business assumptions');
end;$$;
revoke all on function public.estimate_booking_operating_costs(uuid,bigint) from public;

create or replace function public.capture_booking_equipment_cost(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare b public.bookings%rowtype;v_revenue bigint;v_rental_revenue bigint;v_total_weight numeric;v_count integer;v_estimated jsonb;
begin
 select * into b from bookings where id=p_booking_id for update;
 if not found or b.is_test_booking or b.status not in('paid','confirmed','completed') or coalesce(b.amount_paid_cents,0)<=0
  or not exists(select 1 from jobs j where j.id=b.job_id and j.business_id=b.business_id and j.status='completed' and not j.is_deleted)
  or exists(select 1 from booking_profitability_snapshots where booking_id=b.id) then return;end if;
 select sum(weight),count(*) into v_total_weight,v_count from rental_booking_resource_weights(b.id);
 if v_count=0 then return;end if;
 -- Net earned booking revenue excludes sales tax and proportionally removes tax
 -- from recorded refunds; it is not a second cash-receipts calculation.
 v_revenue:=greatest(coalesce(b.total_cents,0)-coalesce(b.tax_cents,0),0);
 if coalesce(b.total_cents,0)>0 then v_revenue:=greatest(v_revenue-round(coalesce(b.refunded_cents,0)::numeric*v_revenue/b.total_cents)::bigint,0);end if;
 v_rental_revenue:=greatest(coalesce(b.total_cents,0)-coalesce(b.tax_cents,0)-coalesce(b.delivery_fee_cents,0)-coalesce(b.operator_total_cents,0),0);
 if coalesce(b.total_cents,0)>0 then v_rental_revenue:=greatest(v_rental_revenue-round(coalesce(b.refunded_cents,0)::numeric*v_rental_revenue/b.total_cents)::bigint,0);end if;
 v_estimated:=estimate_booking_operating_costs(b.id,v_revenue);
 insert into booking_profitability_snapshots(booking_id,business_id,revenue_cents,equipment_allocation_cents,equipment_complete,source_snapshot,estimated_operating_costs,estimated_operating_cost_cents,estimated_contribution_profit_cents,estimated_costs_complete)
 values(b.id,b.business_id,v_revenue,0,true,jsonb_build_object('version',2,'totalCents',b.total_cents,'taxCents',b.tax_cents,'refundCents',b.refunded_cents,'discountCents',b.discount_cents,'basis','net_booking_revenue','invoiceCostEstimateKnown',exists(
  select 1 from invoice_line_items li join invoices i on i.id=li.invoice_id and i.business_id=li.business_id where i.business_id=b.business_id and i.job_id=b.job_id and not i.is_deleted and i.status<>'void'
 ),'invoiceCostEstimateCents',(
  select coalesce(round(sum(li.internal_unit_cost_cents*li.quantity)),0) from invoice_line_items li join invoices i on i.id=li.invoice_id and i.business_id=li.business_id
  where i.business_id=b.business_id and i.job_id=b.job_id and not i.is_deleted and i.status<>'void')),v_estimated,
  case when coalesce((v_estimated->>'complete')::boolean,false) then (v_estimated->>'totalCents')::bigint end,
  case when coalesce((v_estimated->>'complete')::boolean,false) then v_revenue-(v_estimated->>'totalCents')::bigint end,
  coalesce((v_estimated->>'complete')::boolean,false));
 insert into booking_equipment_allocations(business_id,booking_id,inventory_item_id,quantity,revenue_weight,revenue_cents,equipment_allocation_cents,assumptions)
 select b.business_id,b.id,w.inventory_item_id,w.quantity,w.weight,
  -- Cumulative rounding reconciles to the booking cent, even for uneven splits.
  round(v_rental_revenue*sum(case when v_total_weight>0 then w.weight/v_total_weight else 1.0/v_count end) over(order by w.inventory_item_id))::bigint
  -round(v_rental_revenue*(sum(case when v_total_weight>0 then w.weight/v_total_weight else 1.0/v_count end) over(order by w.inventory_item_id)-(case when v_total_weight>0 then w.weight/v_total_weight else 1.0/v_count end)))::bigint,
  case when not i.profitability_tracking_enabled then 0 when i.purchase_cost_cents is null or i.expected_lifetime_rentals is null then null
   else round((i.purchase_cost_cents-i.salvage_value_cents)::numeric*w.quantity/(i.expected_lifetime_rentals::numeric*greatest(i.stock_quantity,1)))::bigint end,
  jsonb_build_object('enabled',i.profitability_tracking_enabled,'purchaseCostCents',i.purchase_cost_cents,'salvageValueCents',i.salvage_value_cents,'expectedLifetimeRentals',i.expected_lifetime_rentals,'stockQuantity',i.stock_quantity,'name',i.name)
 from rental_booking_resource_weights(b.id) w join inventory_items i on i.id=w.inventory_item_id and i.business_id=b.business_id;
 update booking_profitability_snapshots set equipment_allocation_cents=(select coalesce(sum(e.equipment_allocation_cents),0) from booking_equipment_allocations e where e.booking_id=b.id),
  equipment_complete=not exists(select 1 from booking_equipment_allocations e where e.booking_id=b.id and e.equipment_allocation_cents is null)
 where booking_id=b.id;
end;$$;
revoke all on function public.capture_booking_equipment_cost(uuid) from public;
-- Only transition triggers capture allocations; reporting/settings reads never do.
create or replace function public.capture_rental_profitability_transition() returns trigger language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if tg_table_name='jobs' then
  if new.status='completed' and old.status is distinct from new.status then
   for v_id in select id from bookings where job_id=new.id and business_id=new.business_id loop perform capture_booking_equipment_cost(v_id);end loop;
  end if;
 elsif coalesce(old.amount_paid_cents,0)<=0 or old.status not in('paid','confirmed','completed') then
  perform capture_booking_equipment_cost(new.id);
 end if;
 return new;
end;$$;
revoke all on function public.capture_rental_profitability_transition() from public;
create trigger rental_profitability_job_completed after update of status on public.jobs for each row execute function public.capture_rental_profitability_transition();
create trigger rental_profitability_booking_paid after update of status,amount_paid_cents on public.bookings for each row execute function public.capture_rental_profitability_transition();

-- A completed rental's physical usage is immutable once captured. Reopen/correct the
-- job through an explicit future adjustment workflow instead of silently changing it.
create or replace function public.prevent_captured_rental_inventory_mutation() returns trigger language plpgsql security definer set search_path=public as $$
declare v_booking uuid;
begin
 v_booking:=case when tg_table_name='booking_inventory_reservations' then coalesce(new.booking_id,old.booking_id) else coalesce(new.booking_id,old.booking_id) end;
 if exists(select 1 from booking_profitability_snapshots where booking_id=v_booking) then raise exception 'Captured rental inventory cannot be amended after completion. Reopen the job and use a controlled adjustment.'; end if;
 return coalesce(new,old);
end;$$;
revoke all on function public.prevent_captured_rental_inventory_mutation() from public;
create trigger prevent_captured_booking_item_mutation before insert or update or delete on public.booking_items for each row execute function public.prevent_captured_rental_inventory_mutation();
create trigger prevent_captured_reservation_mutation before insert or update or delete on public.booking_inventory_reservations for each row execute function public.prevent_captured_rental_inventory_mutation();

-- Costs are explicitly reviewed once; unknown operating costs must not appear as zero profit costs.
create or replace function public.finalize_booking_profitability(p_business_id uuid,p_booking_id uuid,p_costs jsonb,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare s public.booking_profitability_snapshots%rowtype;v_total bigint:=0;v_key text;v_amount bigint;
begin
 if coalesce(auth.role(),'')<>'service_role' and not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'Not authorized';end if;
 select * into s from booking_profitability_snapshots where booking_id=p_booking_id and business_id=p_business_id for update;
 if not found then raise exception 'Complete a paid rental before reviewing profitability.';end if;
 if jsonb_typeof(p_costs) is distinct from 'object' then raise exception 'Review all operating costs.';end if;
 foreach v_key in array array['labor','delivery','processingFees','other'] loop
  if coalesce(p_costs->>v_key,'')!~'^\d+$' then raise exception 'Review all operating costs.';end if;
  v_amount:=(p_costs->>v_key)::bigint;if v_amount>2147483647 then raise exception 'Cost is too large.';end if;v_total:=v_total+v_amount;
 end loop;
 if length(coalesce(p_reason,''))>1000 then raise exception 'Correction note is too long.';end if;
 insert into booking_profitability_cost_audits(booking_id,business_id,changed_by,previous_costs,new_costs,reason)
 values(p_booking_id,p_business_id,auth.uid(),s.operating_costs,p_costs,nullif(trim(p_reason),''));
 update booking_profitability_snapshots set operating_costs=p_costs,operating_cost_cents=v_total,contribution_profit_cents=revenue_cents-v_total,
  costs_reviewed_at=coalesce(costs_reviewed_at,now()),costs_reviewed_by=coalesce(costs_reviewed_by,auth.uid()),costs_updated_at=now(),costs_updated_by=auth.uid()
 where booking_id=p_booking_id and business_id=p_business_id;
end;$$;
revoke all on function public.finalize_booking_profitability(uuid,uuid,jsonb,text) from public;
grant execute on function public.finalize_booking_profitability(uuid,uuid,jsonb,text) to authenticated,service_role;

create or replace function public.rental_inventory_profitability(p_business_id uuid)
returns table(inventory_item_id uuid,completed_units bigint,tracked_units bigint,reviewed_units bigint,revenue_cents bigint,contribution_cents bigint,equipment_cents bigint,fully_loaded_cents bigint,estimated_contribution_cents bigint,estimated_fully_loaded_cents bigint,excluded_equipment_items bigint,refund_review_units bigint)
language sql stable security invoker set search_path=public as $$
 with eligible as (
  select b.*,greatest(coalesce(b.total_cents,0)-coalesce(b.tax_cents,0)-case when coalesce(b.total_cents,0)>0 then round(coalesce(b.refunded_cents,0)::numeric*greatest(coalesce(b.total_cents,0)-coalesce(b.tax_cents,0),0)/b.total_cents)::bigint else 0 end,0) current_revenue
  from bookings b join jobs j on j.id=b.job_id and j.business_id=b.business_id
  where b.business_id=p_business_id and (coalesce(auth.role(),'')='service_role' or public.has_business_role(p_business_id,array['owner','admin','manager'])) and not b.is_test_booking and b.status in('paid','confirmed','completed','refunded') and coalesce(b.amount_paid_cents,0)>0 and j.status='completed' and not j.is_deleted
 ), usage as (
  select w.inventory_item_id,sum(w.quantity)::bigint units from eligible b cross join lateral rental_booking_resource_weights(b.id) w group by w.inventory_item_id
 ), shares as (
  select e.*,s.revenue_cents original_revenue_cents,s.operating_cost_cents,s.estimated_operating_cost_cents,s.estimated_costs_complete,s.costs_reviewed_at,s.equipment_complete,b.current_revenue,coalesce(b.refunded_cents,0) refunded_cents,
   case when sum(e.revenue_weight) over(partition by e.booking_id)>0 then e.revenue_weight/sum(e.revenue_weight) over(partition by e.booking_id) else 1.0/count(*) over(partition by e.booking_id) end share
  from booking_equipment_allocations e join booking_profitability_snapshots s using(booking_id,business_id) join eligible b on b.id=e.booking_id where e.business_id=p_business_id
 ), allocated as (
  select *,
   case when costs_reviewed_at is not null then round((current_revenue-operating_cost_cents)*sum(share) over(partition by booking_id order by inventory_item_id))::bigint-round((current_revenue-operating_cost_cents)*(sum(share) over(partition by booking_id order by inventory_item_id)-share))::bigint end contribution,
   case when estimated_costs_complete then round((current_revenue-estimated_operating_cost_cents)*sum(share) over(partition by booking_id order by inventory_item_id))::bigint-round((current_revenue-estimated_operating_cost_cents)*(sum(share) over(partition by booking_id order by inventory_item_id)-share))::bigint end estimated_contribution
  from shares
 ), totals as (
  select inventory_item_id,sum(quantity)::bigint tracked,sum(quantity) filter(where costs_reviewed_at is not null)::bigint reviewed,sum(case when original_revenue_cents>0 then round(revenue_cents::numeric*current_revenue/original_revenue_cents)::bigint else 0 end)::bigint revenue,
   sum(contribution)::bigint contribution,case when count(*) filter(where equipment_allocation_cents is null)>0 then null else sum(equipment_allocation_cents)::bigint end equipment,
   case when count(*) filter(where costs_reviewed_at is not null and not equipment_complete)>0 then null else sum(contribution-equipment_allocation_cents) filter(where equipment_complete)::bigint end fully_loaded,
   sum(estimated_contribution)::bigint estimated_contribution,
   case when count(*) filter(where estimated_costs_complete and not equipment_complete)>0 then null else sum(estimated_contribution-equipment_allocation_cents) filter(where equipment_complete)::bigint end estimated_fully_loaded,
   count(*) filter(where coalesce((assumptions->>'enabled')::boolean,false)=false)::bigint excluded_items,
   sum(quantity) filter(where refunded_cents>0)::bigint refund_review_units
  from allocated group by inventory_item_id
 ) select u.inventory_item_id,u.units,coalesce(t.tracked,0),coalesce(t.reviewed,0),t.revenue,t.contribution,t.equipment,t.fully_loaded,t.estimated_contribution,t.estimated_fully_loaded,coalesce(t.excluded_items,0),coalesce(t.refund_review_units,0) from usage u left join totals t using(inventory_item_id);
$$;
revoke all on function public.rental_inventory_profitability(uuid) from public;
grant execute on function public.rental_inventory_profitability(uuid) to authenticated,service_role;
-- Profitability is internal reporting. A malformed legacy value must never roll
-- back payment recording, booking confirmation, or physical job completion.
create or replace function public.capture_rental_profitability_transition() returns trigger language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if tg_table_name='jobs' then
  if new.status='completed' and old.status is distinct from new.status then
   for v_id in select id from bookings where job_id=new.id and business_id=new.business_id loop
    begin perform capture_booking_equipment_cost(v_id); exception when others then raise warning 'rental profitability capture failed for booking %: %',v_id,sqlerrm; end;
   end loop;
  end if;
 elsif coalesce(old.amount_paid_cents,0)<=0 or old.status not in('paid','confirmed','completed') then
  begin perform capture_booking_equipment_cost(new.id); exception when others then raise warning 'rental profitability capture failed for booking %: %',new.id,sqlerrm; end;
 end if;
 return new;
end;$$;
notify pgrst,'reload schema';
commit;
