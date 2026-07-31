-- Inbound SMS intake, consent, idempotency, classification, and customer matching.
begin;

create or replace function public.normalize_phone_e164(p_value text)
returns text language sql immutable strict as $$
 select case
  when regexp_replace(p_value,'\D','','g') ~ '^1[0-9]{10}$' then '+'||regexp_replace(p_value,'\D','','g')
  when regexp_replace(p_value,'\D','','g') ~ '^[0-9]{10}$' then '+1'||regexp_replace(p_value,'\D','','g')
  when p_value ~ '^\+' and length(regexp_replace(p_value,'\D','','g')) between 8 and 15 then '+'||regexp_replace(p_value,'\D','','g')
  else null end
$$;

alter table public.customers
 add column if not exists phone_normalized text,
 add column if not exists sms_consent_status text not null default 'unknown',
 add column if not exists sms_consent_recorded_at timestamptz,
 add column if not exists sms_opted_out_at timestamptz,
 add column if not exists intake_data jsonb not null default '{}'::jsonb,
 add column if not exists intake_data_verified boolean not null default false,
 add column if not exists merged_into_customer_id uuid;

alter table public.customers drop constraint if exists customers_sms_consent_status_check;
alter table public.customers add constraint customers_sms_consent_status_check
 check(sms_consent_status in('unknown','inbound_contact','express','opted_out'));
alter table public.customers drop constraint if exists customers_merged_into_fk;
alter table public.customers add constraint customers_merged_into_fk
 foreign key(business_id,merged_into_customer_id) references public.customers(business_id,id);

update public.customers set phone_normalized=public.normalize_phone_e164(phone)
where phone is not null and phone_normalized is null;
create index if not exists customers_business_normalized_phone_idx
 on public.customers(business_id,phone_normalized) where phone_normalized is not null and is_deleted=false;

create or replace function public.customers_normalize_phone()
returns trigger language plpgsql set search_path=public as $$
begin new.phone_normalized=public.normalize_phone_e164(new.phone);return new;end$$;
drop trigger if exists customers_normalize_phone on public.customers;
create trigger customers_normalize_phone before insert or update of phone on public.customers
for each row execute function public.customers_normalize_phone();

create table if not exists public.business_inbound_sms_settings(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 enabled boolean not null default false,
 inbound_number_e164 text unique,
 auto_reply_enabled boolean not null default true,
 auto_reply_body text not null default 'Thanks for contacting us. We received your message and a team member will follow up shortly. Reply STOP to opt out.',
 emergency_reply_body text not null default 'We received your urgent message. If anyone is in immediate danger, call 911. A team member has been alerted.',
 updated_at timestamptz not null default now(),updated_by uuid references auth.users(id) on delete set null,
 check(inbound_number_e164 is null or inbound_number_e164=public.normalize_phone_e164(inbound_number_e164)),
 check(length(auto_reply_body) between 1 and 1200),check(length(emergency_reply_body) between 1 and 1200)
);

create table if not exists public.customer_sms_consents(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid,phone_e164 text not null,status text not null check(status in('inbound_contact','express','opted_out')),
 source text not null,provider_message_id text,evidence jsonb not null default '{}'::jsonb,
 recorded_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,phone_e164),foreign key(business_id,customer_id) references public.customers(business_id,id) on delete set null
);

create table if not exists public.inbound_sms_messages(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid,provider text not null default 'twilio',provider_message_id text not null,
 from_phone_e164 text not null,to_phone_e164 text not null,body text not null,
 classification text not null default 'normal' check(classification in('normal','likely_spam','escalated','opt_out')),
 escalation_reasons text[] not null default '{}',likely_spam boolean not null default false,
 extracted_data jsonb not null default '{}'::jsonb,extracted_data_verified boolean not null default false,
 auto_reply_status text not null default 'not_attempted' check(auto_reply_status in('not_attempted','suppressed','sent','failed')),
 auto_reply_provider_message_id text,auto_reply_error text,received_at timestamptz not null default now(),
 unique(provider,provider_message_id),foreign key(business_id,customer_id) references public.customers(business_id,id) on delete set null
);
create index if not exists inbound_sms_business_received_idx on public.inbound_sms_messages(business_id,received_at desc);
create index if not exists inbound_sms_escalation_idx on public.inbound_sms_messages(business_id,classification,received_at desc);

alter table public.business_inbound_sms_settings enable row level security;
alter table public.customer_sms_consents enable row level security;
alter table public.inbound_sms_messages enable row level security;
create policy "members read inbound sms settings" on public.business_inbound_sms_settings for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage inbound sms settings" on public.business_inbound_sms_settings for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read sms consent" on public.customer_sms_consents for select to authenticated using(public.is_business_member(business_id));
create policy "members read inbound sms" on public.inbound_sms_messages for select to authenticated using(public.is_business_member(business_id));

create or replace function public.process_inbound_sms(
 p_provider_message_id text,p_from_phone text,p_to_phone text,p_body text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_settings public.business_inbound_sms_settings%rowtype;v_existing public.inbound_sms_messages%rowtype;
 v_customer public.customers%rowtype;v_message public.inbound_sms_messages%rowtype;v_from text;v_to text;v_body text;
 v_optout boolean;v_spam boolean;v_reasons text[]:='{}';v_classification text;v_extracted jsonb:='{}';v_email text;v_name text;
begin
 if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501';end if;
 v_from=public.normalize_phone_e164(p_from_phone);v_to=public.normalize_phone_e164(p_to_phone);v_body=btrim(coalesce(p_body,''));
 if v_from is null or v_to is null or nullif(p_provider_message_id,'') is null or v_body='' then raise exception 'Invalid inbound SMS' using errcode='22023';end if;
 select * into v_existing from public.inbound_sms_messages where provider='twilio' and provider_message_id=p_provider_message_id;
 if found then return jsonb_build_object('duplicate',true,'message_id',v_existing.id,'business_id',v_existing.business_id,'customer_id',v_existing.customer_id,'reply',false);end if;
 select * into v_settings from public.business_inbound_sms_settings where enabled and inbound_number_e164=v_to;
 if not found then raise exception 'Inbound number is not configured' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_settings.business_id::text||':'||v_from,31));
 v_optout=upper(v_body) ~ '^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)([[:punct:][:space:]]|$)';
 v_spam=(length(v_body)>1500 or v_body ~* '(crypto|casino|guaranteed loan|wire transfer|gift card)' or (select count(*) from regexp_matches(v_body,'https?://','gi'))>1);
 if v_body ~* '(emergency|urgent|gas leak|fire|flood|no heat|cancel|cancellation|complaint|angry|refund|chargeback|payment dispute|dispute the charge)' then
  if v_body ~* '(emergency|urgent|gas leak|fire|flood|no heat)' then v_reasons=array_append(v_reasons,'emergency');end if;
  if v_body ~* '(cancel|cancellation)' then v_reasons=array_append(v_reasons,'cancellation');end if;
  if v_body ~* '(complaint|angry)' then v_reasons=array_append(v_reasons,'complaint');end if;
  if v_body ~* '(refund|chargeback|payment dispute|dispute the charge)' then v_reasons=array_append(v_reasons,'payment_dispute');end if;
 end if;
 v_classification=case when v_optout then 'opt_out' when cardinality(v_reasons)>0 then 'escalated' when v_spam then 'likely_spam' else 'normal' end;
 select (regexp_match(v_body,'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}','i'))[1] into v_email;
 select (regexp_match(v_body,'(?i)(?:my name is|this is)\s+([a-z][a-z .''-]{1,80})'))[1] into v_name;
 if v_email is not null then v_extracted=v_extracted||jsonb_build_object('email',v_email,'verification','unconfirmed');end if;
 if v_name is not null then v_extracted=v_extracted||jsonb_build_object('name',btrim(v_name),'verification','unconfirmed');end if;
 select * into v_customer from public.customers where business_id=v_settings.business_id and phone_normalized=v_from and not is_deleted order by created_at limit 1;
 if not found then
  insert into public.customers(business_id,first_name,last_name,phone,phone_normalized,preferred_contact_method,tags,lead_source,notes,is_active,sms_consent_status,sms_consent_recorded_at,sms_opted_out_at,intake_data,intake_data_verified)
  values(v_settings.business_id,coalesce(nullif(btrim(v_name),''),'SMS Lead'),case when v_name is null then right(v_from,4) else '' end,v_from,v_from,'sms',array['sms-lead']||case when v_spam then array['likely-spam'] else array[]::text[] end,'Inbound SMS','Created from inbound text. Original message is preserved in the SMS inbox.',true,case when v_optout then 'opted_out' else 'inbound_contact' end,now(),case when v_optout then now() else null end,v_extracted,false)
  returning * into v_customer;
 elsif v_optout then update public.customers set sms_consent_status='opted_out',sms_opted_out_at=now(),updated_at=now() where id=v_customer.id returning * into v_customer;
 end if;
 insert into public.customer_sms_consents(business_id,customer_id,phone_e164,status,source,provider_message_id,evidence)
 values(v_settings.business_id,v_customer.id,v_from,case when v_optout then 'opted_out' else 'inbound_contact' end,'inbound_sms',p_provider_message_id,jsonb_build_object('keyword',case when v_optout then upper(split_part(v_body,' ',1)) else null end))
 on conflict(business_id,phone_e164) do update set customer_id=excluded.customer_id,status=case when customer_sms_consents.status='opted_out' and excluded.status<>'opted_out' then customer_sms_consents.status else excluded.status end,source=excluded.source,provider_message_id=excluded.provider_message_id,evidence=excluded.evidence,updated_at=now();
 insert into public.inbound_sms_messages(business_id,customer_id,provider_message_id,from_phone_e164,to_phone_e164,body,classification,escalation_reasons,likely_spam,extracted_data)
 values(v_settings.business_id,v_customer.id,p_provider_message_id,v_from,v_to,v_body,v_classification,v_reasons,v_spam,v_extracted) returning * into v_message;
 insert into public.business_activity(business_id,action,entity_type,entity_id,summary)
 values(v_settings.business_id,case when v_classification='escalated' then 'inbound_sms_escalated' else 'inbound_sms_received' end,'customer',v_customer.id,case when v_classification='escalated' then 'Inbound customer text needs staff attention' when v_spam then 'Inbound text marked likely spam' else 'Inbound text received' end);
 return jsonb_build_object('duplicate',false,'message_id',v_message.id,'business_id',v_settings.business_id,'customer_id',v_customer.id,'classification',v_classification,'reply',v_settings.auto_reply_enabled and not v_optout and not v_spam,'reply_body',case when 'emergency'=any(v_reasons) then v_settings.emergency_reply_body else v_settings.auto_reply_body end,'to',v_from,'from',v_to);
end$$;
revoke all on function public.process_inbound_sms(text,text,text,text) from public,anon,authenticated;
grant execute on function public.process_inbound_sms(text,text,text,text) to service_role;

create or replace function public.merge_duplicate_customer_contact(p_source_customer_id uuid,p_target_customer_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_source public.customers%rowtype;v_target public.customers%rowtype;
begin
 select * into v_source from public.customers where id=p_source_customer_id for update;
 select * into v_target from public.customers where id=p_target_customer_id for update;
 if v_source.id is null or v_target.id is null or v_source.business_id<>v_target.business_id or v_source.id=v_target.id then raise exception 'Invalid merge selection' using errcode='22023';end if;
 if not public.has_business_role(v_source.business_id,array['owner','admin','manager']) then raise exception 'Permission denied' using errcode='42501';end if;
 if exists(select 1 from public.jobs where business_id=v_source.business_id and customer_id=v_source.id)
  or exists(select 1 from public.service_locations where business_id=v_source.business_id and customer_id=v_source.id)
  or exists(select 1 from public.recurring_service_series where business_id=v_source.business_id and customer_id=v_source.id)
  or exists(select 1 from public.invoices where business_id=v_source.business_id and customer_id=v_source.id)
  or exists(select 1 from public.estimates where business_id=v_source.business_id and customer_id=v_source.id)
 then raise exception 'The source has operational history and requires a reviewed data merge' using errcode='55000';end if;
 update public.inbound_sms_messages set customer_id=v_target.id where business_id=v_source.business_id and customer_id=v_source.id;
 delete from public.customer_sms_consents where business_id=v_source.business_id and customer_id=v_source.id and exists(select 1 from public.customer_sms_consents t where t.business_id=v_source.business_id and t.phone_e164=customer_sms_consents.phone_e164 and t.customer_id=v_target.id);
 update public.customer_sms_consents set customer_id=v_target.id where business_id=v_source.business_id and customer_id=v_source.id;
 update public.customers set
  email=coalesce(email,v_source.email),phone=coalesce(phone,v_source.phone),notes=concat_ws(E'\n\n',nullif(notes,''),nullif(v_source.notes,'')),
  tags=(select array_agg(distinct value) from unnest(tags||v_source.tags) value),updated_at=now(),updated_by=auth.uid()
 where id=v_target.id;
 update public.customers set is_deleted=true,is_active=false,merged_into_customer_id=v_target.id,updated_at=now(),updated_by=auth.uid() where id=v_source.id;
 insert into public.business_activity(business_id,actor_user_id,action,entity_type,entity_id,summary) values(v_source.business_id,auth.uid(),'customer_contact_merged','customer',v_target.id,'Duplicate contact merged into customer record');
end$$;
revoke all on function public.merge_duplicate_customer_contact(uuid,uuid) from public;
grant execute on function public.merge_duplicate_customer_contact(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
