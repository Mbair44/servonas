-- Keep persisted default quote metadata aligned with the 75% Servonas domain margin.
-- Existing orders retain their recorded retail price and historical markup.
alter table public.website_domain_orders
  alter column retail_markup_bps set default 7500;
