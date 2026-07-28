-- Epic 2.3 Checkpoint 19: onboarding integration, immutable audit, primary-contact synchronization, and operations.
drop policy if exists "customer managers update customer_import_events" on public.customer_import_events;
create or replace function public.prevent_customer_import_event_mutation() returns trigger language plpgsql as $$begin raise exception 'Customer import audit history is immutable';end$$;
drop trigger if exists customer_import_events_immutable on public.customer_import_events;
create trigger customer_import_events_immutable before update or delete on public.customer_import_events for each row execute function public.prevent_customer_import_event_mutation();

create or replace function public.set_customer_primary_contact(p_customer_id uuid,p_contact_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare c public.customers%rowtype;ct public.customer_contacts%rowtype;
begin
 select * into c from public.customers where id=p_customer_id and not is_deleted for update;if c.id is null then raise exception 'Customer not found';end if;
 if not public.has_business_role(c.business_id,array['owner','admin','manager']) then raise exception 'Permission denied' using errcode='42501';end if;
 select * into ct from public.customer_contacts where business_id=c.business_id and customer_id=c.id and id=p_contact_id and is_active for update;if ct.id is null then raise exception 'Contact not found';end if;
 update public.customer_contacts set is_primary=(id=ct.id),updated_at=now(),updated_by=auth.uid() where business_id=c.business_id and customer_id=c.id and is_active;
 update public.customers set first_name=coalesce(nullif(ct.first_name,''),first_name),last_name=coalesce(nullif(ct.last_name,''),last_name),email=ct.email,phone=ct.phone,updated_at=now(),updated_by=auth.uid() where id=c.id;
end$$;
revoke all on function public.set_customer_primary_contact(uuid,uuid) from public;grant execute on function public.set_customer_primary_contact(uuid,uuid) to authenticated;

create or replace function public.audit_customer_import_onboarding() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status in('completed','completed_with_errors') and old.status is distinct from new.status then
  insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,step_key,status,metadata)
  values(new.business_id,'customer_migration_completed',auth.uid(),'readiness',new.status,jsonb_build_object('import_id',new.id,'imported_customers',new.imported_customer_count,'imported_locations',new.imported_location_count,'failed_records',new.failed_row_count,'billing_required',false));
 end if;return new;
end$$;
drop trigger if exists customer_import_onboarding_audit on public.customer_imports;
create trigger customer_import_onboarding_audit after update of status on public.customer_imports for each row execute function public.audit_customer_import_onboarding();

create or replace function public.expire_customer_import_raw_data(p_limit integer default 50)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;v_ids uuid[];
begin
 select array_agg(id) into v_ids from(select id from public.customer_imports where raw_data_expires_at<=now() and status in('completed','completed_with_errors','failed','canceled','rolled_back','rollback_partial') order by raw_data_expires_at limit greatest(1,least(p_limit,500)) for update skip locked) expired;
 if coalesce(array_length(v_ids,1),0)=0 then return 0;end if;
 delete from public.customer_import_rows where import_id=any(v_ids);delete from public.customer_import_entities where import_id=any(v_ids);
 update public.customer_imports set storage_path=null,source_columns='[]',column_mappings='[]',updated_at=now() where id=any(v_ids);
 get diagnostics v_count=row_count;return v_count;
end$$;
revoke all on function public.expire_customer_import_raw_data(integer) from public;grant execute on function public.expire_customer_import_raw_data(integer) to service_role;
comment on function public.expire_customer_import_raw_data(integer) is 'Clears expired database references and previews. The operations worker must also remove the corresponding private storage object before invoking this function.';
