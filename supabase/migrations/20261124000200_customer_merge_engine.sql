-- Customer Merge V1 / PR 2. No provider APIs, queues, or communication
-- services are called here: this is a database-only preview/confirm engine.
begin;

-- The request/preview fingerprints use pgcrypto. Do not rely on an earlier
-- baseline migration having installed it in a fresh Supabase project.
create extension if not exists "pgcrypto";

create or replace function public.customer_merge_request_fingerprint(
  p_primary_customer_id uuid,p_duplicate_customer_id uuid,p_resolutions jsonb
) returns text language sql immutable set search_path=public as $$
 select encode(digest(jsonb_build_object(
   'primaryCustomerId',p_primary_customer_id,'duplicateCustomerId',p_duplicate_customer_id,
   'resolutions',coalesce(p_resolutions,'{}'::jsonb)
 )::text,'sha256'),'hex')
$$;

create or replace function public.customer_merge_assert_authorized_pair(
  p_primary_customer_id uuid,p_duplicate_customer_id uuid
) returns table(business_id uuid,primary_customer public.customers,duplicate_customer public.customers)
language plpgsql security definer set search_path=public as $$
declare p public.customers%rowtype; d public.customers%rowtype;
begin
 select * into p from public.customers where id=p_primary_customer_id;
 select * into d from public.customers where id=p_duplicate_customer_id;
 if p.id is null or d.id is null or p.business_id<>d.business_id then
   raise exception 'CUSTOMER_MERGE_NOT_FOUND' using errcode='P0002';
 end if;
 if not public.has_business_role(p.business_id,array['owner','admin']) then
   raise exception 'CUSTOMER_MERGE_FORBIDDEN' using errcode='42501';
 end if;
 if p.id=d.id then raise exception 'CUSTOMER_MERGE_SELF' using errcode='22023'; end if;
 if p.merged_into_customer_id is not null or p.is_deleted or not p.is_active then
   raise exception 'CUSTOMER_MERGE_PRIMARY_INACTIVE' using errcode='55000';
 end if;
 if d.merged_into_customer_id is not null or d.is_deleted or not d.is_active then
   raise exception 'CUSTOMER_MERGE_DUPLICATE_ALREADY_MERGED' using errcode='55000';
 end if;
 return query select p.business_id,p,d;
end $$;
revoke all on function public.customer_merge_assert_authorized_pair(uuid,uuid) from public;

create or replace function public.customer_merge_billing_blockers(
 p_business_id uuid,p_primary_customer_id uuid,p_duplicate_customer_id uuid
) returns jsonb language sql stable security definer set search_path=public as $$
 with profiles as (
  select customer_id,provider_customer_id,autopay_enabled,default_payment_method_id
  from public.customer_billing_profiles where business_id=p_business_id and customer_id in(p_primary_customer_id,p_duplicate_customer_id)
 ), flags as (
  select 'BILLING_DISTINCT_STRIPE_CUSTOMERS' code,'Both profiles use different Stripe customer identities.' detail
  where (select provider_customer_id from profiles where customer_id=p_primary_customer_id) is not null
    and (select provider_customer_id from profiles where customer_id=p_duplicate_customer_id) is not null
    and (select provider_customer_id from profiles where customer_id=p_primary_customer_id)<>(select provider_customer_id from profiles where customer_id=p_duplicate_customer_id)
  union all select 'BILLING_DUPLICATE_STRIPE_IDENTITY','The duplicate has a Stripe billing identity; V1 will not transfer it.'
  where exists(select 1 from profiles where customer_id=p_duplicate_customer_id and provider_customer_id is not null)
  union all select 'BILLING_SAVED_PAYMENT_METHOD','A saved payment method is attached to either customer.'
  where exists(select 1 from public.customer_payment_methods where business_id=p_business_id and customer_id in(p_primary_customer_id,p_duplicate_customer_id) and status='active')
  union all select 'BILLING_AUTOPAY_ENABLED','Autopay is enabled for either customer.'
  where exists(select 1 from profiles where autopay_enabled)
  union all select 'BILLING_RECURRING_AUTO_CHARGE','A recurring service plan can automatically charge a customer.'
  where exists(select 1 from public.recurring_service_series where business_id=p_business_id and customer_id in(p_primary_customer_id,p_duplicate_customer_id) and is_active and auto_charge_enabled)
  union all select 'BILLING_IN_FLIGHT_ATTEMPT','A pending or processing payment attempt exists.'
  where exists(select 1 from public.payment_attempts a join public.invoices i on i.id=a.invoice_id and i.business_id=a.business_id where a.business_id=p_business_id and i.customer_id in(p_primary_customer_id,p_duplicate_customer_id) and a.status='pending')
 ) select coalesce(jsonb_agg(jsonb_build_object('code',code,'message',detail) order by code),'[]'::jsonb) from flags
$$;

create or replace function public.customer_merge_preview(
 p_primary_customer_id uuid,p_duplicate_customer_id uuid,p_resolutions jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare b uuid; p public.customers%rowtype; d public.customers%rowtype; blockers jsonb; state jsonb; request_fp text; preview_fp text;
begin
 select business_id,primary_customer,duplicate_customer into b,p,d from public.customer_merge_assert_authorized_pair(p_primary_customer_id,p_duplicate_customer_id);
 if jsonb_typeof(coalesce(p_resolutions,'{}'::jsonb))<>'object' then raise exception 'CUSTOMER_MERGE_INVALID_RESOLUTIONS' using errcode='22023'; end if;
 blockers:=public.customer_merge_billing_blockers(b,p.id,d.id);
 state:=jsonb_build_object(
  'primary',to_jsonb(p),'duplicate',to_jsonb(d),'resolutions',p_resolutions,
  'channels',(select coalesce(jsonb_agg(to_jsonb(x) order by x.channel_type,x.normalized_value),'[]'::jsonb) from public.customer_contact_channels x where x.business_id=b and x.customer_id in(p.id,d.id) and x.is_active),
  'addresses',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at,x.id),'[]'::jsonb) from public.customer_addresses x where x.business_id=b and x.customer_id in(p.id,d.id) and x.is_active),
  'counts',jsonb_build_object(
   'activeJobs',(select count(*) from public.jobs x where x.business_id=b and x.customer_id=d.id and not x.is_deleted and x.status not in('completed','canceled','declined')),
   'historicalJobs',(select count(*) from public.jobs x where x.business_id=b and x.customer_id=d.id and (x.is_deleted or x.status in('completed','canceled','declined'))),
   'bookings',(select count(*) from public.bookings x where x.business_id=b and x.customer_id=d.id),
   'estimates',(select count(*) from public.estimates x where x.business_id=b and x.customer_id=d.id and not x.is_deleted),
   'locations',(select count(*) from public.service_locations x where x.business_id=b and x.customer_id=d.id and not x.is_deleted),
   'servicePlans',(select count(*) from public.recurring_service_series x where x.business_id=b and x.customer_id=d.id),
   'invoices',(select count(*) from public.invoices x where x.business_id=b and x.customer_id=d.id and not x.is_deleted),
   'payments',(select count(*) from public.payments x where x.business_id=b and x.customer_id=d.id),
   'messages',(select count(*) from public.customer_messages x where x.business_id=b and x.customer_id=d.id)
  ),
  'billingBlockers',blockers
 );
 request_fp:=public.customer_merge_request_fingerprint(p.id,d.id,p_resolutions);
 preview_fp:=encode(digest(state::text,'sha256'),'hex');
 return jsonb_build_object('primaryCustomer',to_jsonb(p),'duplicateCustomer',to_jsonb(d),
  'proposedProfile',jsonb_build_object('first_name',coalesce(p_resolutions->>'firstName',p.first_name),'last_name',coalesce(p_resolutions->>'lastName',p.last_name),'email',coalesce(p_resolutions->>'email',p.email),'phone',coalesce(p_resolutions->>'phone',p.phone)),
  'alternateChannels',state->'channels','addressCandidates',state->'addresses','dependencyCounts',state->'counts',
  'billing',jsonb_build_object('compatible',jsonb_array_length(blockers)=0,'blockers',blockers),
  'blockers',blockers,'warnings',case when jsonb_array_length(blockers)=0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object('code','CUSTOMER_MERGE_BILLING_REVIEW','message','Historical financial records remain unchanged; active billing dependencies block this merge.')) end,
  'requestFingerprint',request_fp,'previewFingerprint',preview_fp);
end $$;
revoke all on function public.customer_merge_preview(uuid,uuid,jsonb) from public;
grant execute on function public.customer_merge_preview(uuid,uuid,jsonb) to authenticated;

-- Prevent future operational writes from targeting an archived/merged customer.
create or replace function public.prevent_merged_customer_operational_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare c public.customers%rowtype;
begin
 if new.customer_id is null then return new; end if;
 select * into c from public.customers where id=new.customer_id and business_id=new.business_id;
 if c.id is null or c.is_deleted or not c.is_active or c.merged_into_customer_id is not null then
   raise exception 'CUSTOMER_MERGE_INACTIVE_CUSTOMER_WRITE' using errcode='23503';
 end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['jobs','bookings','estimates','service_locations','recurring_service_series'] loop
  execute format('drop trigger if exists prevent_merged_customer_operational_write on public.%I',t);
  execute format('create trigger prevent_merged_customer_operational_write before insert or update of customer_id on public.%I for each row execute function public.prevent_merged_customer_operational_write()',t);
 end loop;
end $$;

create or replace function public.confirm_customer_merge(
 p_primary_customer_id uuid,p_duplicate_customer_id uuid,p_resolutions jsonb,p_preview_fingerprint text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare b uuid;p public.customers%rowtype;d public.customers%rowtype;preview jsonb;request_fp text;existing public.customer_merge_audits%rowtype; blockers jsonb;counts jsonb;audit_id uuid;
begin
 request_fp:=public.customer_merge_request_fingerprint(p_primary_customer_id,p_duplicate_customer_id,coalesce(p_resolutions,'{}'::jsonb));
 select * into existing from public.customer_merge_audits where idempotency_key=p_idempotency_key;
 if found then
  if existing.request_fingerprint<>request_fp then raise exception 'CUSTOMER_MERGE_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
  if not public.has_business_role(existing.business_id,array['owner','admin']) then raise exception 'CUSTOMER_MERGE_FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object('status','completed','auditId',existing.id,'primaryCustomerId',existing.primary_customer_id,'duplicateCustomerId',existing.duplicate_customer_id,'idempotent',true,'affectedRecordCounts',existing.affected_record_counts);
 end if;
 -- Deterministic row locks; the preview is recomputed under those locks.
 perform pg_advisory_xact_lock(hashtextextended(least(p_primary_customer_id,p_duplicate_customer_id)::text||':'||greatest(p_primary_customer_id,p_duplicate_customer_id)::text,481516));
 select * into p from public.customers where id=p_primary_customer_id for update;
 select * into d from public.customers where id=p_duplicate_customer_id for update;
 select business_id,primary_customer,duplicate_customer into b,p,d from public.customer_merge_assert_authorized_pair(p_primary_customer_id,p_duplicate_customer_id);
 preview:=public.customer_merge_preview(p.id,d.id,coalesce(p_resolutions,'{}'::jsonb));
 if preview->>'previewFingerprint'<>p_preview_fingerprint then raise exception 'CUSTOMER_MERGE_STALE_PREVIEW' using errcode='40001'; end if;
 blockers:=preview->'blockers'; if jsonb_array_length(blockers)>0 then raise exception 'CUSTOMER_MERGE_BLOCKED: %',blockers using errcode='55000'; end if;
 -- Current/future operations are moved. Historical financial records remain on
 -- their original identity and are displayed later through canonical reads.
 update public.service_locations set customer_id=p.id,updated_at=now(),updated_by=auth.uid(),is_primary=false where business_id=b and customer_id=d.id;
 update public.recurring_service_series set customer_id=p.id,updated_at=now(),updated_by=auth.uid() where business_id=b and customer_id=d.id;
 update public.jobs set customer_id=p.id,updated_at=now(),updated_by=auth.uid() where business_id=b and customer_id=d.id and not is_deleted and status not in('completed','canceled','declined');
 update public.estimates set customer_id=p.id,updated_at=now(),updated_by=auth.uid() where business_id=b and customer_id=d.id and not is_deleted and status in('draft','sent','viewed');
 update public.customer_addresses set customer_id=p.id,is_primary=false,updated_at=now(),updated_by=auth.uid() where business_id=b and customer_id=d.id;
 update public.customer_external_references set customer_id=p.id where business_id=b and customer_id=d.id;
 update public.customer_hvac_equipment set customer_id=p.id,updated_at=now(),updated_by=auth.uid() where business_id=b and customer_id=d.id;
 update public.customer_employee_preferences set customer_id=p.id where business_id=b and customer_id=d.id;
 update public.customer_messages set customer_id=p.id,updated_at=now() where business_id=b and customer_id=d.id;
 update public.inbound_sms_messages set customer_id=p.id where business_id=b and customer_id=d.id;
 update public.missed_call_recovery_leads set customer_id=p.id,updated_at=now() where business_id=b and customer_id=d.id;
 update public.missed_call_recovery_messages set customer_id=p.id where business_id=b and customer_id=d.id;
 update public.customer_contact_channels set is_primary=false,updated_at=now(),updated_by=auth.uid() where business_id=b and customer_id=d.id;
 -- Exact-channel opt-out always wins when duplicate and primary share a channel.
 update public.customer_contact_channels pc set consent_status='opted_out',consent_recorded_at=coalesce(pc.consent_recorded_at,dc.consent_recorded_at),updated_at=now(),updated_by=auth.uid()
 from public.customer_contact_channels dc where pc.business_id=b and dc.business_id=b and pc.customer_id=p.id and dc.customer_id=d.id and pc.channel_type=dc.channel_type and pc.normalized_value=dc.normalized_value and dc.consent_status in('opted_out','unsubscribed');
 update public.customer_contact_channels dc set customer_id=p.id,updated_at=now(),updated_by=auth.uid()
 where dc.business_id=b and dc.customer_id=d.id and not exists(select 1 from public.customer_contact_channels pc where pc.business_id=b and pc.customer_id=p.id and pc.channel_type=dc.channel_type and pc.normalized_value=dc.normalized_value);
 -- Release the duplicate's active-email uniqueness claim before a selected
 -- alternate email is made primary; its identity remains in contact channels.
 update public.customers set email=null,updated_at=now(),updated_by=auth.uid()
 where id=d.id and nullif(lower(p_resolutions->>'email'),'')=lower(email) and lower(email)<>lower(p.email);
 update public.customers set first_name=coalesce(nullif(p_resolutions->>'firstName',''),first_name),last_name=coalesce(nullif(p_resolutions->>'lastName',''),last_name),email=coalesce(nullif(lower(p_resolutions->>'email'),''),email),phone=coalesce(nullif(p_resolutions->>'phone',''),phone),notes=concat_ws(E'\n\n',nullif(notes,''),nullif(d.notes,'')),tags=(select array_agg(distinct x) from unnest(coalesce(tags,'{}')||coalesce(d.tags,'{}')) x),updated_at=now(),updated_by=auth.uid() where id=p.id;
 update public.customers set is_active=false,is_deleted=true,merged_into_customer_id=p.id,merged_at=now(),merged_by=auth.uid(),updated_at=now(),updated_by=auth.uid() where id=d.id;
 counts:=preview->'dependencyCounts';
 insert into public.customer_merge_audits(business_id,primary_customer_id,duplicate_customer_id,performed_by,idempotency_key,request_fingerprint,preview_fingerprint,request_payload,primary_snapshot,duplicate_snapshot,field_resolutions,affected_record_counts,status,completed_at)
 values(b,p.id,d.id,auth.uid(),p_idempotency_key,request_fp,p_preview_fingerprint,jsonb_build_object('primaryCustomerId',p.id,'duplicateCustomerId',d.id),to_jsonb(p),to_jsonb(d),coalesce(p_resolutions,'{}'::jsonb),counts,'completed',now()) returning id into audit_id;
 insert into public.business_activity(business_id,actor_user_id,action,entity_type,entity_id,summary) values(b,auth.uid(),'customer_merged','customer',p.id,'Customer merged into this profile');
 return jsonb_build_object('status','completed','auditId',audit_id,'primaryCustomerId',p.id,'duplicateCustomerId',d.id,'idempotent',false,'affectedRecordCounts',counts);
end $$;
revoke all on function public.confirm_customer_merge(uuid,uuid,jsonb,text,uuid) from public;
grant execute on function public.confirm_customer_merge(uuid,uuid,jsonb,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
