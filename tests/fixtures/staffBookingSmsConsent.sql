-- Minimal existing production schema; deliberately no consent-function mock.
alter table bookings
 add column sms_consent boolean default false,
 add column sms_consent_recorded_at timestamptz,
 add column sms_consent_source text,
 add column sms_consent_disclosure text,
 add column sms_consent_disclosure_version text;
alter table customers
 add column phone_normalized text,
 add column sms_consent_status text default 'unknown',
 add column sms_consent_recorded_at timestamptz,
 add column sms_opted_out_at timestamptz;
create table customer_sms_consents(
 business_id uuid,customer_id uuid,phone_e164 text,status text,source text,
 evidence jsonb,recorded_at timestamptz,updated_at timestamptz,provider_message_id text,
 unique(business_id,phone_e164)
);
-- Simulate an environment with the pre-staff consent constraint still installed.
alter table bookings add constraint bookings_sms_consent_evidence_check check (
 sms_consent_recorded_at is null or (
  sms_consent_source in ('web_booking') and
  nullif(btrim(sms_consent_disclosure),'') is not null and
  nullif(btrim(sms_consent_disclosure_version),'') is not null
 )
);
