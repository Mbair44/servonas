begin;

-- Dashboard billing reads are tenant-isolated. Ledger rows remain append-only;
-- this only permits the same owners/admins who can manage a subscription to see
-- their own cycle and reservation summaries.
create policy "owners read platform fee cycles" on public.platform_fee_cycles for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin']) or public.is_servonas_platform_admin());
create policy "owners read platform fee reservations" on public.platform_fee_reservations for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin']) or public.is_servonas_platform_admin());

notify pgrst,'reload schema';
commit;
