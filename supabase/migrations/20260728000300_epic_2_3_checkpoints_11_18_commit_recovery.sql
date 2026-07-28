-- Epic 2.3 Checkpoints 11-18: recurring migration, review receipts, idempotent commit, retry, history, and safe rollback.
create table if not exists public.customer_import_commit_receipts(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,import_id uuid not null,entity_key text not null,operation text not null check(operation in('created','updated','linked','skipped','failed')),
 destination_type text not null,destination_id uuid,error_code text,before_values jsonb not null default '{}',applied_values jsonb not null default '{}',
 created_at timestamptz not null default now(),unique(business_id,import_id,entity_key),
 foreign key(business_id,import_id) references public.customer_imports(business_id,id) on delete cascade
);
create table if not exists public.customer_import_attachment_placeholders(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,import_id uuid not null,source_row_number integer,file_name text,source_reference text,status text not null default 'not_migrated' check(status in('not_migrated','acknowledged','skipped')),
 created_at timestamptz not null default now(),foreign key(business_id,import_id) references public.customer_imports(business_id,id) on delete cascade
);
alter table public.customer_import_commit_receipts enable row level security;alter table public.customer_import_attachment_placeholders enable row level security;
create policy "customer managers read import receipts" on public.customer_import_commit_receipts for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "customer managers read attachment placeholders" on public.customer_import_attachment_placeholders for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));

create or replace function public.commit_customer_import(p_import_id uuid,p_expected_version integer,p_ready_only boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.customer_imports%rowtype;e record;r record;v_customer uuid;v_location uuid;v_service uuid;v_decision record;v_created int:=0;v_updated int:=0;v_locations int:=0;v_failed int:=0;v_skipped int:=0;v_first text;v_last text;v_active boolean;
begin
 select * into s from public.customer_imports where id=p_import_id for update;
 if s.id is null then raise exception 'Import not found' using errcode='P0002';end if;
 if auth.role()<>'service_role' and not public.has_business_role(s.business_id,array['owner','admin','manager']) then raise exception 'Permission denied' using errcode='42501';end if;
 if s.version<>p_expected_version then raise exception 'Import changed' using errcode='40001';end if;
 if s.status not in('ready','queued','needs_review','completed_with_errors','failed') then raise exception 'Import is not ready';end if;
 update public.customer_imports set status='importing',current_stage='commit',started_at=coalesce(started_at,now()),version=version+1,last_activity_at=now(),updated_at=now() where id=s.id;
 for e in select * from public.customer_import_entities where business_id=s.business_id and import_id=s.id and entity_type='customer' and status not in('skipped','imported','updated','rolled_back') order by created_at loop
  begin
   if exists(select 1 from public.customer_import_commit_receipts where business_id=s.business_id and import_id=s.id and entity_key='customer:'||e.group_key and operation<>'failed') then continue;end if;
   if e.status='invalid' then v_failed:=v_failed+1;continue;end if;
   select d.*,c.existing_customer_id into v_decision from public.customer_import_duplicate_decisions d left join public.customer_import_duplicate_candidates c on c.id=d.candidate_id and c.business_id=d.business_id where d.business_id=s.business_id and d.entity_id=e.id;
   if v_decision.decision='skip' then insert into public.customer_import_commit_receipts(business_id,import_id,entity_key,operation,destination_type)values(s.business_id,s.id,'customer:'||e.group_key,'skipped','customer')on conflict do nothing;v_skipped:=v_skipped+1;continue;end if;
   v_customer:=v_decision.existing_customer_id;
   if v_customer is null then
    v_first:=coalesce(nullif(e.normalized_values->>'first_name',''),nullif(e.normalized_values->>'company_name',''),'Imported customer');v_last:=coalesce(e.normalized_values->>'last_name','');
    v_active:=lower(coalesce(e.normalized_values->>'status','active')) not in('inactive','former','no','0');
    insert into public.customers(business_id,first_name,last_name,company_name,email,phone,notes,is_active,created_by,updated_by)
    values(s.business_id,v_first,v_last,nullif(e.normalized_values->>'company_name',''),nullif(e.normalized_values->>'email',''),nullif(e.normalized_values->>'phone',''),nullif(e.normalized_values->>'notes',''),v_active,auth.uid(),auth.uid()) returning id into v_customer;
    insert into public.customer_import_commit_receipts(business_id,import_id,entity_key,operation,destination_type,destination_id,applied_values)values(s.business_id,s.id,'customer:'||e.group_key,'created','customer',v_customer,jsonb_build_object('source','customer_import'));v_created:=v_created+1;
   else
    if v_decision.decision='update_selected' then
     update public.customers set
      first_name=case when coalesce((v_decision.field_updates->>'first_name')::boolean,false) and nullif(e.normalized_values->>'first_name','') is not null then e.normalized_values->>'first_name' else first_name end,
      last_name=case when coalesce((v_decision.field_updates->>'last_name')::boolean,false) and nullif(e.normalized_values->>'last_name','') is not null then e.normalized_values->>'last_name' else last_name end,
      company_name=case when coalesce((v_decision.field_updates->>'company_name')::boolean,false) and nullif(e.normalized_values->>'company_name','') is not null then e.normalized_values->>'company_name' else company_name end,
      email=case when coalesce((v_decision.field_updates->>'email')::boolean,false) and nullif(e.normalized_values->>'email','') is not null then e.normalized_values->>'email' else email end,
      phone=case when coalesce((v_decision.field_updates->>'phone')::boolean,false) and nullif(e.normalized_values->>'phone','') is not null then e.normalized_values->>'phone' else phone end,updated_by=auth.uid(),updated_at=now()
     where business_id=s.business_id and id=v_customer;
     v_updated:=v_updated+1;
    end if;
    insert into public.customer_import_commit_receipts(business_id,import_id,entity_key,operation,destination_type,destination_id,applied_values)values(s.business_id,s.id,'customer:'||e.group_key,case when v_decision.decision='update_selected' then 'updated' else 'linked' end,'customer',v_customer,coalesce(v_decision.field_updates,'{}'))on conflict do nothing;
   end if;
   if not exists(select 1 from public.customer_contacts where business_id=s.business_id and customer_id=v_customer and is_primary and is_active) and coalesce(nullif(e.normalized_values->>'email',''),nullif(e.normalized_values->>'phone',''),nullif(e.normalized_values->>'contact_name','')) is not null then
    insert into public.customer_contacts(business_id,customer_id,label,first_name,last_name,email,phone,is_primary,created_by,updated_by)values(s.business_id,v_customer,'Primary',coalesce(e.normalized_values->>'first_name',''),coalesce(e.normalized_values->>'last_name',''),nullif(e.normalized_values->>'email',''),nullif(e.normalized_values->>'phone',''),true,auth.uid(),auth.uid());
   end if;
   if nullif(e.normalized_values->>'external_id','') is not null then insert into public.customer_external_references(business_id,source_system,entity_type,external_id,customer_id)values(s.business_id,'spreadsheet','customer',e.normalized_values->>'external_id',v_customer)on conflict(business_id,source_system,entity_type,external_id)do nothing;end if;
   for r in select * from public.customer_import_rows where business_id=s.business_id and import_id=s.id and source_row_number=any(e.source_row_numbers) loop
    if nullif(r.normalized_values->>'service_address','') is not null and nullif(r.normalized_values->>'service_city','') is not null and nullif(r.normalized_values->>'service_state','') is not null and nullif(r.normalized_values->>'service_postal_code','') is not null then
     select id into v_location from public.service_locations where business_id=s.business_id and customer_id=v_customer and is_deleted=false and lower(street_address)=lower(r.normalized_values->>'service_address') and lower(coalesce(unit,''))=lower(coalesce(r.normalized_values->>'service_address_2','')) and lower(city)=lower(r.normalized_values->>'service_city') and lower(state)=lower(r.normalized_values->>'service_state') and lower(postal_code)=lower(r.normalized_values->>'service_postal_code') limit 1;
     if v_location is null then insert into public.service_locations(business_id,customer_id,location_name,street_address,unit,city,state,postal_code,country,is_primary,created_by,updated_by)values(s.business_id,v_customer,coalesce(nullif(r.normalized_values->>'location_name',''),'Imported location'),r.normalized_values->>'service_address',nullif(r.normalized_values->>'service_address_2',''),r.normalized_values->>'service_city',r.normalized_values->>'service_state',r.normalized_values->>'service_postal_code',coalesce(nullif(r.normalized_values->>'service_country',''),'US'),not exists(select 1 from public.service_locations where business_id=s.business_id and customer_id=v_customer and is_primary and is_active and not is_deleted),auth.uid(),auth.uid())returning id into v_location;v_locations:=v_locations+1;insert into public.customer_import_commit_receipts(business_id,import_id,entity_key,operation,destination_type,destination_id)values(s.business_id,s.id,'location:'||e.group_key||':'||r.source_row_number,'created','service_location',v_location)on conflict do nothing;end if;
     if nullif(r.normalized_values->>'frequency','') is not null then
      select id into v_service from public.services where business_id=s.business_id and lower(name)=lower(r.normalized_values->>'service_name') and is_active=true limit 1;
      if v_service is not null and r.normalized_values->>'recurrence_unit' in('day','week','month','year') and coalesce((r.normalized_values->>'recurrence_interval')::integer,0) between 1 and 120 and not exists(select 1 from public.recurring_service_series where business_id=s.business_id and customer_id=v_customer and service_location_id=v_location and service_id=v_service and is_active) then
       insert into public.recurring_service_series(business_id,customer_id,service_location_id,service_id,cadence_unit,cadence_interval,next_due_on,created_by,updated_by)
       values(s.business_id,v_customer,v_location,v_service,r.normalized_values->>'recurrence_unit',(r.normalized_values->>'recurrence_interval')::integer,case when (r.normalized_values->>'next_service_date')~'^\d{4}-\d{2}-\d{2}$' then (r.normalized_values->>'next_service_date')::date else null end,auth.uid(),auth.uid());
      end if;
     end if;
    end if;
    if nullif(r.normalized_values->>'billing_address','') is not null and nullif(r.normalized_values->>'billing_city','') is not null and nullif(r.normalized_values->>'billing_state','') is not null then
     if not exists(select 1 from public.customer_addresses where business_id=s.business_id and customer_id=v_customer and address_type='billing' and is_active and lower(street_address)=lower(r.normalized_values->>'billing_address') and lower(coalesce(unit,''))=lower(coalesce(r.normalized_values->>'billing_address_2',''))) then
      insert into public.customer_addresses(business_id,customer_id,address_type,label,street_address,unit,city,state,postal_code,country,is_primary,created_by,updated_by)
      values(s.business_id,v_customer,'billing','Imported billing address',r.normalized_values->>'billing_address',nullif(r.normalized_values->>'billing_address_2',''),r.normalized_values->>'billing_city',r.normalized_values->>'billing_state',nullif(r.normalized_values->>'billing_postal_code',''),coalesce(nullif(r.normalized_values->>'billing_country',''),'US'),not exists(select 1 from public.customer_addresses where business_id=s.business_id and customer_id=v_customer and address_type='billing' and is_primary and is_active),auth.uid(),auth.uid());
     end if;
    end if;
   end loop;
   update public.customer_import_entities set destination_id=v_customer,status=case when v_decision.decision='update_selected' then 'updated' else 'imported' end,updated_at=now() where id=e.id;
  exception when others then
   v_failed:=v_failed+1;insert into public.customer_import_commit_receipts(business_id,import_id,entity_key,operation,destination_type,error_code)values(s.business_id,s.id,'customer:'||e.group_key,'failed','customer',sqlstate)on conflict(business_id,import_id,entity_key)do update set operation='failed',error_code=excluded.error_code;
   update public.customer_import_entities set status='failed',errors=jsonb_build_array('This customer could not be imported. Correct the data and retry.'),updated_at=now() where id=e.id;
  end;
 end loop;
 update public.customer_imports set status=case when v_failed>0 then 'completed_with_errors' else 'completed' end,current_stage='results',imported_customer_count=imported_customer_count+v_created,updated_customer_count=updated_customer_count+v_updated,imported_location_count=imported_location_count+v_locations,failed_row_count=v_failed,skipped_row_count=skipped_row_count+v_skipped,completed_at=now(),rollback_status=case when v_created+v_locations>0 then 'eligible' else 'not_requested' end,version=version+1,last_activity_at=now(),updated_at=now() where id=s.id;
 insert into public.customer_import_events(business_id,import_id,event_type,actor_user_id,metadata)values(s.business_id,s.id,'migration_completed',auth.uid(),jsonb_build_object('created_customers',v_created,'updated_customers',v_updated,'created_locations',v_locations,'failed',v_failed,'skipped',v_skipped));
 return jsonb_build_object('created_customers',v_created,'updated_customers',v_updated,'created_locations',v_locations,'failed',v_failed,'skipped',v_skipped);
end$$;
revoke all on function public.commit_customer_import(uuid,integer,boolean) from public;grant execute on function public.commit_customer_import(uuid,integer,boolean) to authenticated;

create or replace function public.rollback_customer_import(p_import_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.customer_imports%rowtype;r record;v_removed int:=0;v_protected int:=0;
begin select * into s from public.customer_imports where id=p_import_id for update;if s.id is null then raise exception 'Import not found';end if;
 if not public.has_business_role(s.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;if s.version<>p_expected_version then raise exception 'Import changed' using errcode='40001';end if;
 for r in select * from public.customer_import_commit_receipts where business_id=s.business_id and import_id=s.id and operation='created' order by case destination_type when 'service_location' then 1 else 2 end loop
  if r.destination_type='service_location' then if exists(select 1 from public.jobs where business_id=s.business_id and service_location_id=r.destination_id and not is_deleted) then v_protected:=v_protected+1;else update public.service_locations set is_deleted=true,is_active=false,updated_at=now(),updated_by=auth.uid() where business_id=s.business_id and id=r.destination_id;v_removed:=v_removed+1;end if;
  elsif r.destination_type='customer' then if exists(select 1 from public.jobs where business_id=s.business_id and customer_id=r.destination_id and not is_deleted) then v_protected:=v_protected+1;else update public.customers set is_deleted=true,is_active=false,updated_at=now(),updated_by=auth.uid() where business_id=s.business_id and id=r.destination_id;v_removed:=v_removed+1;end if;end if;
 end loop;
 update public.customer_imports set status=case when v_protected>0 then 'rollback_partial' else 'rolled_back' end,current_stage='rollback',rollback_status=case when v_protected>0 then 'completed_with_protected_records' else 'completed' end,version=version+1,last_activity_at=now(),updated_at=now() where id=s.id;
 insert into public.customer_import_events(business_id,import_id,event_type,actor_user_id,metadata)values(s.business_id,s.id,'rollback_completed',auth.uid(),jsonb_build_object('removed',v_removed,'protected',v_protected));return jsonb_build_object('removed',v_removed,'protected',v_protected);
end$$;
revoke all on function public.rollback_customer_import(uuid,integer) from public;grant execute on function public.rollback_customer_import(uuid,integer) to authenticated;
