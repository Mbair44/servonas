-- Disposable PostgreSQL integration fixture. Run only against a local test DB.
drop schema if exists themed_banner_test cascade;
create schema themed_banner_test;
set search_path=themed_banner_test;
create table banners(id uuid primary key, quantity integer not null);
create table bookings(id uuid primary key,status text not null,starts_at timestamptz not null,ends_at timestamptz not null);
create table reservations(booking_id uuid references bookings(id),banner_id uuid references banners(id),primary key(booking_id,banner_id));
insert into banners values('00000000-0000-0000-0000-000000000001',1);
insert into bookings values
 ('00000000-0000-0000-0000-000000000011','pending_payment','2027-01-01 10:00+00','2027-01-01 18:00+00'),
 ('00000000-0000-0000-0000-000000000012','pending_payment','2027-01-01 10:00+00','2027-01-01 18:00+00');
create or replace function reserve_banner(p_booking uuid,p_banner uuid) returns void language plpgsql as $$
declare remaining integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_banner::text,0));
 select b.quantity-coalesce((select count(*) from reservations r join bookings other_booking on other_booking.id=r.booking_id where r.banner_id=b.id and other_booking.status in('pending_payment','paid','confirmed')),0) into remaining from banners b where b.id=p_banner;
 if coalesce(remaining,0)<1 then raise exception 'banner unavailable' using errcode='23505'; end if;
 insert into reservations values(p_booking,p_banner);
end $$;
