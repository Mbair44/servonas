-- Explicit SMS consent is phone-specific. Updating a matched customer to a new
-- phone number must never carry consent forward to that different number.
create or replace function public.reset_customer_sms_consent_on_phone_change()
returns trigger language plpgsql set search_path=public as $$
begin
 if old.phone_normalized is distinct from new.phone_normalized then
  new.sms_consent_status:='unknown';
  new.sms_consent_recorded_at:=null;
  new.sms_opted_out_at:=null;
 end if;
 return new;
end;$$;

drop trigger if exists customers_reset_sms_consent_on_phone_change on public.customers;
create trigger customers_reset_sms_consent_on_phone_change
before update of phone,phone_normalized on public.customers
for each row execute function public.reset_customer_sms_consent_on_phone_change();

alter table public.bookings drop constraint if exists bookings_sms_consent_evidence_check;
alter table public.bookings add constraint bookings_sms_consent_evidence_check check (
 sms_consent_recorded_at is null or (
  sms_consent_source in ('web_booking','staff_booking') and
  nullif(btrim(sms_consent_disclosure),'') is not null and
  nullif(btrim(sms_consent_disclosure_version),'') is not null
 )
);

create or replace function public.record_staff_booking_sms_consent(
 p_booking_id uuid,p_granted boolean,p_disclosure text,p_disclosure_version text
) returns void language plpgsql security definer set search_path=public as $$
declare v_booking public.bookings%rowtype;v_phone text;v_now timestamptz:=now();
begin
 select * into v_booking from public.bookings where id=p_booking_id for update;
 if not found or v_booking.business_id is null or v_booking.customer_id is null then raise exception 'Booking consent target was not found.';end if;
 update public.bookings set sms_consent=coalesce(p_granted,false),sms_consent_recorded_at=v_now,sms_consent_source='staff_booking',sms_consent_disclosure=p_disclosure,sms_consent_disclosure_version=p_disclosure_version,updated_at=v_now where id=p_booking_id;
 if not coalesce(p_granted,false) then return;end if;
 if nullif(btrim(coalesce(p_disclosure,'')),'') is null or nullif(btrim(coalesce(p_disclosure_version,'')),'') is null then raise exception 'Consent disclosure evidence is required.';end if;
 select phone_normalized into v_phone from public.customers where id=v_booking.customer_id and business_id=v_booking.business_id and not is_deleted;
 if v_phone is null then raise exception 'A valid mobile phone is required to record SMS consent.';end if;
 update public.customers set sms_consent_status='express',sms_consent_recorded_at=v_now,sms_opted_out_at=null,updated_at=v_now where id=v_booking.customer_id and business_id=v_booking.business_id;
 insert into public.customer_sms_consents(business_id,customer_id,phone_e164,status,source,evidence,recorded_at,updated_at) values(v_booking.business_id,v_booking.customer_id,v_phone,'express','staff_booking',jsonb_build_object('booking_id',p_booking_id,'granted',true,'disclosure',p_disclosure,'disclosure_version',p_disclosure_version),v_now,v_now) on conflict(business_id,phone_e164) do update set customer_id=excluded.customer_id,status='express',source=excluded.source,provider_message_id=null,evidence=excluded.evidence,recorded_at=excluded.recorded_at,updated_at=excluded.updated_at;
end;$$;
revoke all on function public.record_staff_booking_sms_consent(uuid,boolean,text,text) from public;
grant execute on function public.record_staff_booking_sms_consent(uuid,boolean,text,text) to service_role;
