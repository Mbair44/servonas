alter table public.business_website_settings
 add column full_day_rental_message text not null default $message$Full-Day Rentals
Your rental is yours for the day — no short 2–4 hour rental windows. Enjoy more time without feeling rushed.$message$,
 add constraint full_day_rental_message_length check (length(full_day_rental_message)<=1000);
comment on column public.business_website_settings.full_day_rental_message is
 'Party-rental website and booking message. First line is the heading; blank hides the message. Does not change rental duration or pricing.';
