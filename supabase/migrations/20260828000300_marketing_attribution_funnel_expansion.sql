begin;

alter table public.booking_attribution_sessions
  add column if not exists browser text,
  add column if not exists operating_system text,
  add column if not exists device_type text;

alter table public.booking_funnel_events
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null;

alter table public.booking_funnel_events
  drop constraint if exists booking_funnel_events_event_name_check;

alter table public.booking_funnel_events
  add constraint booking_funnel_events_event_name_check
  check (
    event_name in (
      'landing_page_view','inventory_item_view','inventory_item_clicked','check_availability_clicked',
      'availability_date_selected','booking_started','customer_info_entered','checkout_started',
      'booking_completed','availability_check_started','event_date_selected','available_inventory_viewed',
      'rental_viewed','rental_availability_checked','rental_available','rental_unavailable',
      'reserve_clicked','item_added_to_cart','event_date_changed','unavailable_alternative_clicked',
      'landing_view','service_view','inventory_view','booking_cta_click','availability_check',
      'date_selected','lead_submitted','payment_completed'
    )
  );

create index if not exists booking_funnel_events_business_service_idx on public.booking_funnel_events(business_id,service_id,occurred_at desc);
create index if not exists booking_funnel_events_business_invoice_idx on public.booking_funnel_events(business_id,invoice_id,occurred_at desc);

notify pgrst,'reload schema';
commit;
