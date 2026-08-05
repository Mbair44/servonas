alter table public.bookings add column if not exists job_id uuid references public.jobs(id) on delete set null;
create unique index if not exists bookings_job_id_unique on public.bookings(job_id) where job_id is not null;
create index if not exists bookings_business_job_idx on public.bookings(business_id,job_id);

-- Repair already-confirmed rental reservations that predate job creation.
insert into public.jobs(
  business_id,customer_id,title,status,starts_at,ends_at,service_address,description,
  subtotal,tax_amount,booking_source,estimated_duration_minutes,payment_status,request_key
)
select
  b.business_id,b.customer_id,
  case when count(*)=1 then max(i.name) else 'Party rental reservation' end,
  'scheduled',
  ((min(bi.rental_date)::date+b.event_start_time) at time zone coalesce(bus.timezone,'America/Phoenix')),
  ((min(bi.rental_date)::date+b.event_end_time) at time zone coalesce(bus.timezone,'America/Phoenix')),
  concat_ws(', ',b.delivery_address,b.delivery_city,b.delivery_state,b.delivery_zip),
  'Rental items:'||chr(10)||string_agg(i.name||' × '||bi.quantity,chr(10) order by i.name),
  b.total_cents/100.0,0,'website',
  greatest(1,round(extract(epoch from (b.event_end_time-b.event_start_time))/60)::integer),
  case when coalesce(b.amount_paid_cents,0)<=0 then 'unpaid' when coalesce(b.balance_due_cents,0)>0 then 'partially_paid' else 'paid' end,
  b.id
from public.bookings b
join public.businesses bus on bus.id=b.business_id
join public.booking_items bi on bi.booking_id=b.id
join public.inventory_items i on i.id=bi.inventory_item_id
where b.status='confirmed' and b.business_id is not null and b.customer_id is not null and b.job_id is null
group by b.id,b.business_id,b.customer_id,b.event_start_time,b.event_end_time,b.delivery_address,b.delivery_city,b.delivery_state,b.delivery_zip,b.total_cents,b.amount_paid_cents,b.balance_due_cents,bus.timezone
on conflict (business_id,request_key) where request_key is not null do nothing;

update public.bookings b set job_id=j.id
from public.jobs j
where b.job_id is null and j.business_id=b.business_id and j.request_key=b.id;
