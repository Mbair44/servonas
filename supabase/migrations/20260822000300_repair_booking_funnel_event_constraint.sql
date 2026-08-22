begin;

alter table public.booking_funnel_events
  drop constraint if exists booking_funnel_events_event_name_check;

alter table public.booking_funnel_events
  add constraint booking_funnel_events_event_name_check
  check (
    event_name in (
      'landing_page_view',
      'inventory_item_view',
      'check_availability_clicked',
      'availability_date_selected',
      'booking_started',
      'customer_info_entered',
      'checkout_started',
      'booking_completed',
      'availability_check_started',
      'event_date_selected',
      'available_inventory_viewed',
      'rental_viewed',
      'rental_availability_checked',
      'rental_available',
      'rental_unavailable',
      'reserve_clicked',
      'item_added_to_cart',
      'event_date_changed',
      'unavailable_alternative_clicked'
    )
  );

notify pgrst, 'reload schema';
commit;
