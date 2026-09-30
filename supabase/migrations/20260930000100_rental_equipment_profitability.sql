begin;
-- Reuse the existing acquisition record; never maintain two purchase prices.
alter table public.inventory_items
 add column acquisition_cost_cents integer generated always as (purchase_cost_cents) stored,
 add column expected_lifetime_rentals integer check(expected_lifetime_rentals>0),
 add column salvage_value_cents integer not null default 0 check(salvage_value_cents>=0),
 add column profitability_tracking_enabled boolean not null default false,
 add constraint inventory_profitability_resale_check check(purchase_cost_cents is null or salvage_value_cents<=purchase_cost_cents);

create table public.booking_profitability_snapshots(
 booking_id uuid primary key references public.bookings(id) on delete restrict,
 business_id uuid not null references public.businesses(id),
 captured_at timestamptz not null default now(),
 revenue_cents bigint not null check(revenue_cents>=0),
 equipment_allocation_cents bigint not null check(equipment_allocation_cents>=0),
 equipment_complete boolean not null,
 source_snapshot jsonb not null,
 operating_costs jsonb,
 operating_cost_cents bigint check(operating_cost_cents>=0),
 contribution_profit_cents bigint,
 costs_reviewed_at timestamptz,
 costs_reviewed_by uuid,
 unique(business_id,booking_id)
);
create table public.booking_equipment_allocations(
 business_id uuid not null,
 booking_id uuid not null,
 inventory_item_id uuid not null references public.inventory_items(id),
 quantity integer not null check(quantity>0),
 revenue_weight numeric not null,
 revenue_cents bigint not null,
 equipment_allocation_cents bigint,
 assumptions jsonb not null,
 primary key(booking_id,inventory_item_id),
 foreign key(business_id,booking_id) references public.booking_profitability_snapshots(business_id,booking_id)
);
alter table public.booking_profitability_snapshots enable row level security;
alter table public.booking_equipment_allocations enable row level security;
create policy "read tenant booking profitability" on public.booking_profitability_snapshots for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "read tenant equipment allocations" on public.booking_equipment_allocations for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager']));
grant select on public.booking_profitability_snapshots,public.booking_equipment_allocations to authenticated;
grant all on public.booking_profitability_snapshots,public.booking_equipment_allocations to service_role;

-- Revenue weights follow rental_inventory_performance: line gross share followed
-- by reserved physical-resource weights. Quantity is actual reserved stock units.
create function public.rental_booking_resource_weights(p_booking_id uuid)
returns table(inventory_item_id uuid,quantity integer,weight numeric)
language sql stable security invoker set search_path=public as $$
 with lines as (
  select bi.id,bi.inventory_item_id,bi.quantity,greatest(bi.unit_price_cents,0)::numeric*bi.quantity gross
  from booking_items bi where bi.booking_id=p_booking_id and bi.status in('paid','confirmed','completed')
 ), resources as (
  select l.id,coalesce(r.resource_inventory_item_id,l.inventory_item_id) item_id,
   coalesce(r.quantity,l.quantity) qty,l.gross,
   coalesce(r.revenue_allocation_weight,1)::numeric / nullif(sum(coalesce(r.revenue_allocation_weight,1)) over(partition by l.id),0) share
  from lines l left join booking_inventory_reservations r on r.booking_item_id=l.id
 ) select item_id,sum(qty)::integer,sum(gross*share) from resources group by item_id;
$$;
revoke all on function public.rental_booking_resource_weights(uuid) from public;
grant execute on function public.rental_booking_resource_weights(uuid) to authenticated,service_role;

create function public.capture_booking_equipment_cost(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare b public.bookings%rowtype;v_revenue bigint;v_rental_revenue bigint;v_total_weight numeric;v_count integer;
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
 insert into booking_profitability_snapshots(booking_id,business_id,revenue_cents,equipment_allocation_cents,equipment_complete,source_snapshot)
 values(b.id,b.business_id,v_revenue,0,true,jsonb_build_object('version',1,'totalCents',b.total_cents,'taxCents',b.tax_cents,'refundCents',b.refunded_cents,'discountCents',b.discount_cents,'basis','net_booking_revenue','invoiceCostEstimateCents',(
  select coalesce(round(sum(li.internal_unit_cost_cents*li.quantity)),0) from invoice_line_items li join invoices i on i.id=li.invoice_id and i.business_id=li.business_id
  where i.business_id=b.business_id and i.job_id=b.job_id and not i.is_deleted and i.status<>'void')));
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
create function public.capture_rental_profitability_transition() returns trigger language plpgsql security definer set search_path=public as $$
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

-- Costs are explicitly reviewed once; unknown operating costs must not appear as zero profit costs.
create function public.finalize_booking_profitability(p_business_id uuid,p_booking_id uuid,p_costs jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare s public.booking_profitability_snapshots%rowtype;v_total bigint:=0;v_key text;v_amount bigint;
begin
 if coalesce(auth.role(),'')<>'service_role' and not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'Not authorized';end if;
 select * into s from booking_profitability_snapshots where booking_id=p_booking_id and business_id=p_business_id for update;
 if not found then raise exception 'Complete a paid rental before reviewing profitability.';end if;
 if s.costs_reviewed_at is not null then raise exception 'Profitability costs are already finalized.';end if;
 if jsonb_typeof(p_costs) is distinct from 'object' then raise exception 'Review all operating costs.';end if;
 foreach v_key in array array['labor','delivery','processingFees','other'] loop
  if coalesce(p_costs->>v_key,'')!~'^\d+$' then raise exception 'Review all operating costs.';end if;
  v_amount:=(p_costs->>v_key)::bigint;if v_amount>2147483647 then raise exception 'Cost is too large.';end if;v_total:=v_total+v_amount;
 end loop;
 update booking_profitability_snapshots set operating_costs=p_costs,operating_cost_cents=v_total,contribution_profit_cents=revenue_cents-v_total,costs_reviewed_at=now(),costs_reviewed_by=auth.uid()
 where booking_id=p_booking_id and business_id=p_business_id;
end;$$;
revoke all on function public.finalize_booking_profitability(uuid,uuid,jsonb) from public;
grant execute on function public.finalize_booking_profitability(uuid,uuid,jsonb) to authenticated,service_role;

create function public.rental_inventory_profitability(p_business_id uuid)
returns table(inventory_item_id uuid,completed_units bigint,tracked_units bigint,reviewed_units bigint,revenue_cents bigint,contribution_cents bigint,equipment_cents bigint,fully_loaded_cents bigint)
language sql stable security invoker set search_path=public as $$
 with eligible as (
  select b.id from bookings b join jobs j on j.id=b.job_id and j.business_id=b.business_id
  where b.business_id=p_business_id and (coalesce(auth.role(),'')='service_role' or public.has_business_role(p_business_id,array['owner','admin','manager'])) and not b.is_test_booking and b.status in('paid','confirmed','completed') and coalesce(b.amount_paid_cents,0)>0 and j.status='completed' and not j.is_deleted
 ), usage as (
  select w.inventory_item_id,sum(w.quantity)::bigint units from eligible b cross join lateral rental_booking_resource_weights(b.id) w group by w.inventory_item_id
 ), shares as (
  select e.*,s.contribution_profit_cents,s.costs_reviewed_at,s.equipment_complete,
   case when sum(e.revenue_weight) over(partition by e.booking_id)>0 then e.revenue_weight/sum(e.revenue_weight) over(partition by e.booking_id) else 1.0/count(*) over(partition by e.booking_id) end share
  from booking_equipment_allocations e join booking_profitability_snapshots s using(booking_id,business_id) join eligible b on b.id=e.booking_id where e.business_id=p_business_id
 ), allocated as (
  select *,round(contribution_profit_cents*sum(share) over(partition by booking_id order by inventory_item_id))::bigint-round(contribution_profit_cents*(sum(share) over(partition by booking_id order by inventory_item_id)-share))::bigint contribution from shares
 ), totals as (
  select inventory_item_id,sum(quantity)::bigint tracked,sum(quantity) filter(where costs_reviewed_at is not null)::bigint reviewed,sum(revenue_cents)::bigint revenue,
   sum(contribution)::bigint contribution,case when count(*) filter(where equipment_allocation_cents is null)>0 then null else sum(equipment_allocation_cents)::bigint end equipment,
   case when count(*) filter(where costs_reviewed_at is not null and not equipment_complete)>0 then null else sum(contribution-equipment_allocation_cents) filter(where equipment_complete)::bigint end fully_loaded
  from allocated group by inventory_item_id
 ) select u.inventory_item_id,u.units,coalesce(t.tracked,0),coalesce(t.reviewed,0),t.revenue,t.contribution,t.equipment,t.fully_loaded from usage u left join totals t using(inventory_item_id);
$$;
revoke all on function public.rental_inventory_profitability(uuid) from public;
grant execute on function public.rental_inventory_profitability(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
