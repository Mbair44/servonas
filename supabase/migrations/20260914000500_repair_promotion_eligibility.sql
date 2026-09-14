begin;
-- Allows owners/admins to repair category links on an existing offer without changing its URL or publishing state.
create function public.set_promotion_categories(p_business_id uuid,p_promotion_id uuid,p_category_ids uuid[])
returns void language plpgsql security invoker set search_path=public as $$
declare v_discount_id uuid; v_count integer;
begin
 if auth.uid() is null or not public.has_business_role(p_business_id,array['owner','admin']) then
  raise exception 'promotion_permission_denied' using errcode='42501';
 end if;
 select discount_id into v_discount_id from public.promotions where id=p_promotion_id and business_id=p_business_id for update;
 if not found then raise exception 'promotion_not_found' using errcode='22023'; end if;
 select count(*) into v_count from public.rental_inventory_categories where business_id=p_business_id and id=any(p_category_ids);
 if v_count=0 or v_count<>(select count(distinct id) from unnest(p_category_ids) id) then
  raise exception 'promotion_category_unavailable' using errcode='22023';
 end if;
 delete from public.promotion_categories where promotion_id=p_promotion_id;
 insert into public.promotion_categories(promotion_id,category_id)
  select p_promotion_id,id from public.rental_inventory_categories where business_id=p_business_id and id=any(p_category_ids);
 delete from public.discount_items where business_id=p_business_id and discount_id=v_discount_id;
 insert into public.discount_items(business_id,discount_id,inventory_item_id)
  select p_business_id,v_discount_id,id from public.inventory_items where business_id=p_business_id and active and category_id=any(p_category_ids);
end;$$;
revoke all on function public.set_promotion_categories(uuid,uuid,uuid[]) from public;
grant execute on function public.set_promotion_categories(uuid,uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
