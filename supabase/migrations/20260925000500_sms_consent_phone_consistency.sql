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
