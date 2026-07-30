begin;

alter table public.business_billing_settings
 add column if not exists accept_online_card boolean not null default true,
 add column if not exists accept_cash boolean not null default false,
 add column if not exists accept_check boolean not null default false,
 add column if not exists accept_pay_by_phone boolean not null default false,
 add column if not exists check_payable_to text,
 add column if not exists payment_phone text;

comment on column public.business_billing_settings.accept_online_card is 'Show card payment only when Stripe Connect is also ready.';
comment on column public.business_billing_settings.check_payable_to is 'Public check-payment instruction; only shown when checks are enabled.';
comment on column public.business_billing_settings.payment_phone is 'Public payment phone; only shown when pay-by-phone is enabled.';

commit;
