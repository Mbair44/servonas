begin;

create policy "members read promotion categories" on public.promotion_categories
 for select to authenticated using (
  exists(select 1 from public.promotions p where p.id=promotion_id and public.is_business_member(p.business_id))
 );
create policy "admins manage promotion categories" on public.promotion_categories
 for all to authenticated using (
  exists(select 1 from public.promotions p where p.id=promotion_id and public.has_business_role(p.business_id,array['owner','admin']))
 ) with check (
  exists(select 1 from public.promotions p join public.rental_inventory_categories c on c.business_id=p.business_id
   where p.id=promotion_id and c.id=category_id and public.has_business_role(p.business_id,array['owner','admin']))
 );

-- One transaction prevents a failed category/target insert from leaving a partial offer.
-- SECURITY INVOKER keeps tenant RLS active throughout the save.
create function public.save_promotion_draft(
 p_business_id uuid,p_name text,p_slug text,p_discount_type text,p_discount_value integer,p_tiers jsonb,
 p_category_ids uuid[],p_usage_limit integer,p_headline text,p_subheadline text,p_cta_text text,p_terms text
) returns uuid language plpgsql security invoker set search_path=public as $$
declare
 v_actor uuid=auth.uid(); v_code text; v_discount_id uuid; v_promotion_id uuid;
 v_promotion public.promotions%rowtype; v_discount public.discounts%rowtype;
 v_category_count integer;
begin
 if v_actor is null or not public.has_business_role(p_business_id,array['owner','admin']) then
  raise exception 'promotion_permission_denied' using errcode='42501';
 end if;
 if p_slug !~ '^[a-z0-9-]{2,80}$' or length(btrim(p_name)) not between 1 and 160 then
  raise exception 'promotion_details_invalid' using errcode='22023';
 end if;
 select count(distinct c.id) into v_category_count from public.rental_inventory_categories c
  where c.business_id=p_business_id and c.id=any(p_category_ids);
 if v_category_count=0 or v_category_count<>(select count(distinct id) from unnest(p_category_ids) id) then
  raise exception 'promotion_category_unavailable' using errcode='22023';
 end if;
 v_code=left(upper('AUTO_'||replace(p_slug,'-','_')),40);
 select * into v_promotion from public.promotions where business_id=p_business_id and lower(slug)=p_slug for update;
 if found then
  -- Only the submitting owner's incomplete, inactive draft is eligible for repair.
  select * into v_discount from public.discounts where business_id=p_business_id and id=v_promotion.discount_id for update;
  if v_promotion.status<>'draft' or v_discount.is_active or v_discount.created_by is distinct from v_actor
    or v_discount.normalized_code<>v_code or v_discount.application_method<>'automatic'
    or exists(select 1 from public.promotion_categories where promotion_id=v_promotion.id)
    or exists(select 1 from public.discount_items where discount_id=v_discount.id) then
   raise exception 'promotion_slug_in_use' using errcode='23505';
  end if;
  v_promotion_id=v_promotion.id; v_discount_id=v_discount.id;
 else
  -- A failure before the old page insert may have left only an inactive discount.
  select * into v_discount from public.discounts where business_id=p_business_id and normalized_code=v_code for update;
  if found then
   if v_discount.is_active or v_discount.created_by is distinct from v_actor or v_discount.application_method<>'automatic'
     or exists(select 1 from public.promotions where discount_id=v_discount.id)
     or exists(select 1 from public.discount_items where discount_id=v_discount.id) then
    raise exception 'promotion_code_in_use' using errcode='23505';
   end if;
   v_discount_id=v_discount.id;
  end if;
 end if;
 if v_discount_id is null then
  insert into public.discounts(business_id,name,code,tiers,discount_type,discount_value,applies_to,application_method,usage_limit,per_customer_limit,is_active,created_by,updated_by)
  values(p_business_id,btrim(p_name),v_code,p_tiers,p_discount_type,p_discount_value,'selected_items','automatic',p_usage_limit,1,false,v_actor,v_actor)
  returning id into v_discount_id;
 else
  update public.discounts set name=btrim(p_name),tiers=p_tiers,discount_type=p_discount_type,discount_value=p_discount_value,
   applies_to='selected_items',usage_limit=p_usage_limit,per_customer_limit=1,updated_by=v_actor
   where id=v_discount_id and business_id=p_business_id;
 end if;
 if v_promotion_id is null then
  insert into public.promotions(business_id,discount_id,name,slug,status,headline,subheadline,cta_text,terms)
  values(p_business_id,v_discount_id,btrim(p_name),p_slug,'draft',p_headline,p_subheadline,p_cta_text,p_terms)
  returning id into v_promotion_id;
 else
  update public.promotions set name=btrim(p_name),headline=p_headline,subheadline=p_subheadline,cta_text=p_cta_text,terms=p_terms
   where id=v_promotion_id and business_id=p_business_id;
 end if;
 insert into public.promotion_categories(promotion_id,category_id)
  select v_promotion_id,id from public.rental_inventory_categories where business_id=p_business_id and id=any(p_category_ids);
 insert into public.discount_items(business_id,discount_id,inventory_item_id)
  select p_business_id,v_discount_id,id from public.inventory_items
   where business_id=p_business_id and active and category_id=any(p_category_ids);
 return v_promotion_id;
end;$$;
revoke all on function public.save_promotion_draft(uuid,text,text,text,integer,jsonb,uuid[],integer,text,text,text,text) from public;
grant execute on function public.save_promotion_draft(uuid,text,text,text,integer,jsonb,uuid[],integer,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
