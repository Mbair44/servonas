alter table public.business_website_settings
 add column if not exists weather_policy_text text not null default $p$Weather Policy

The business may postpone, reschedule, modify, or cancel when actual or forecast weather makes operation unsafe or unsuitable, including wind, rain, thunderstorms, lightning, or severe weather. Payments become booking credit valid for one year. The business has final discretion over safe delivery, setup, and operation.$p$,
 add column if not exists rental_waiver_policy_text text not null default $p$Rental Waiver & Safety Rules

Customer acknowledges the inherent risks of inflatable and rental equipment, agrees to follow safety rules and provide appropriate adult supervision, assumes risks associated with use, and, to the fullest extent permitted by law, releases and holds harmless the business, its owners, employees, contractors, and agents from claims arising from use or misuse except liability that legally cannot be waived. Customer is responsible for guests following safety rules.$p$;
alter table public.bookings
 add column if not exists weather_policy_text_snapshot text,
 add column if not exists rental_waiver_policy_text_snapshot text,
 add column if not exists rental_terms_acknowledged_at timestamptz;

-- Upgrade only the former Servonas default; tenant-authored cancellation terms remain intact.
update public.business_website_settings
set cancellation_policy_text = $p$Cancellation Policy

Customer may cancel anytime. Payments are non-refundable but become credit toward another booking for up to 1 year from the original event date. Future booking is subject to availability and current pricing; customer pays any difference. Credit has no cash value.$p$
where cancellation_policy_text = $p$Cancellation Policy

A 50% deposit is required to reserve your rental date and equipment. All deposits are non-refundable if you cancel your reservation for any reason.

If you need to reschedule, please contact us as soon as possible. Rescheduling is subject to availability and approval by the business.

If the business must cancel because of unsafe weather, equipment problems, or another issue on its side, it will work with the customer to reschedule or refund any applicable payments.$p$;
