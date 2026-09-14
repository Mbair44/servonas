alter table public.business_website_settings
 add column cancellation_policy_enabled boolean not null default false,
 add column cancellation_policy_text text not null default $policy$Cancellation Policy

A 50% deposit is required to reserve your rental date and equipment. All deposits are non-refundable if you cancel your reservation for any reason.

If you need to reschedule, please contact us as soon as possible. Rescheduling is subject to availability and approval by the business.

If the business must cancel because of unsafe weather, equipment problems, or another issue on its side, it will work with the customer to reschedule or refund any applicable payments.$policy$,
 add column require_cancellation_acknowledgment boolean not null default true,
 add constraint cancellation_policy_text_valid check (length(cancellation_policy_text)<=10000 and (not cancellation_policy_enabled or length(btrim(cancellation_policy_text))>0));
alter table public.bookings
 add column cancellation_policy_acknowledged boolean not null default false,
 add column cancellation_policy_acknowledged_at timestamptz,
 add column cancellation_policy_text_snapshot text,
 add constraint cancellation_acknowledgment_proof check (not cancellation_policy_acknowledged or (cancellation_policy_acknowledged_at is not null and cancellation_policy_text_snapshot is not null));
