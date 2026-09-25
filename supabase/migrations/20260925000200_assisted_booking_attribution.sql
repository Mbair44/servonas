alter table public.bookings add column if not exists conversion_method text not null default 'online' check (conversion_method in ('online','admin_assisted'));
alter table public.bookings add column if not exists recovered_from_booking_id uuid references public.bookings(id) on delete set null;
alter table public.bookings add column if not exists recovered_from_attribution_session_id uuid;
alter table public.bookings add constraint bookings_recovered_session_tenant_fk foreign key (business_id,recovered_from_attribution_session_id) references public.booking_attribution_sessions(business_id,id) on delete set null;
alter table public.booking_attribution_snapshots add column if not exists attribution_evidence text not null default 'tracked_session' check (attribution_evidence in ('tracked_session','customer_reported'));
create index if not exists bookings_recovered_from_booking_idx on public.bookings(business_id,recovered_from_booking_id) where recovered_from_booking_id is not null;
