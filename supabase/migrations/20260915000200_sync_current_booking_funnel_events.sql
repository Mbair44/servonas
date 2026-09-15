begin;

-- Keep this allowlist exactly synchronized with bookingFunnelEvents in lib/bookingFunnel.ts.
alter table public.booking_funnel_events
  drop constraint if exists booking_funnel_events_event_name_check;

alter table public.booking_funnel_events
  add constraint booking_funnel_events_event_name_check
  check (event_name in (
    'promotion_landing_view','promotion_primary_cta_clicked','booking_date_selection_started',
    'booking_date_selected','promotion_inventory_viewed','promotion_item_selected',
    'promotion_no_inventory_available','initiate_checkout','purchase','landing_page_view',
    'inventory_item_view','inventory_item_clicked','check_availability_clicked',
    'availability_date_selected','booking_started','customer_info_entered','checkout_started',
    'booking_completed','availability_check_started','event_date_selected',
    'available_inventory_viewed','rental_viewed','rental_availability_checked','rental_available',
    'rental_unavailable','reserve_clicked','item_added_to_cart','event_date_changed',
    'unavailable_alternative_clicked','landing_view','service_view','inventory_view',
    'booking_cta_click','availability_check','date_selected','lead_submitted','payment_completed',
    'session_heartbeat','link_click','button_click','phone_click','sms_click','email_click',
    'form_start','form_submit','product_service_selection','delivery_address_entered',
    'delivery_distance_calculated','delivery_fee_calculated','outside_service_area',
    'delivery_quote_requested','delivery_fee_overridden'
  ));

notify pgrst, 'reload schema';

commit;
