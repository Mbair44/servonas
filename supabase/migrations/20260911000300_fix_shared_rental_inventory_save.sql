-- Platform administrators enter tenant workspaces through the server-side
-- service-role client. Keep normal tenant calls membership-scoped while allowing
-- that already-authorized server path to save included inventory.
create or replace function public.replace_rental_listing_inventory_requirements(
  p_business_id uuid,
  p_listing_inventory_item_id uuid,
  p_resource_inventory_item_ids uuid[]
) returns void
language plpgsql security definer set search_path=public as $$
declare v_resource_count integer;
begin
  if coalesce(auth.role(),'')<>'service_role'
    and not coalesce(public.is_servonas_platform_admin(),false)
    and not coalesce(public.has_business_role(p_business_id,array['owner','admin']),false) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if not exists(select 1 from public.inventory_items where id=p_listing_inventory_item_id and business_id=p_business_id) then
    raise exception 'rental_listing_not_found';
  end if;
  if p_resource_inventory_item_ids is null or cardinality(p_resource_inventory_item_ids)=0 then
    raise exception 'included_inventory_required';
  end if;
  select count(distinct id) into v_resource_count
  from public.inventory_items
  where business_id=p_business_id and id=any(p_resource_inventory_item_ids);
  if v_resource_count<>cardinality(p_resource_inventory_item_ids) then
    raise exception 'invalid_included_inventory';
  end if;
  delete from public.rental_listing_inventory_requirements
  where business_id=p_business_id and listing_inventory_item_id=p_listing_inventory_item_id;
  insert into public.rental_listing_inventory_requirements(
    business_id,listing_inventory_item_id,resource_inventory_item_id,quantity_required
  )
  select p_business_id,p_listing_inventory_item_id,resource_id,1
  from unnest(p_resource_inventory_item_ids) resource_id;
end;
$$;

revoke all on function public.replace_rental_listing_inventory_requirements(uuid,uuid,uuid[]) from public;
grant execute on function public.replace_rental_listing_inventory_requirements(uuid,uuid,uuid[]) to authenticated,service_role;
