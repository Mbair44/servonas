begin;
alter table public.twilio_tenant_activation_events add column if not exists request_key uuid;
create unique index if not exists twilio_test_request_unique on public.twilio_tenant_activation_events(business_id,request_key) where request_key is not null;
alter table public.twilio_message_usage add column if not exists provider_error_message text;
alter table public.twilio_message_usage add column if not exists last_status_callback_at timestamptz;
create or replace function public.process_inbound_sms(
 p_provider_message_id text,p_from_phone text,p_to_phone text,p_body text,
 p_business_id uuid,p_account_sid text,p_opt_out_type text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_settings public.business_inbound_sms_settings%rowtype;v_existing public.inbound_sms_messages%rowtype;
 v_customer public.customers%rowtype;v_message public.inbound_sms_messages%rowtype;v_from text;v_to text;v_body text;
 v_start boolean;v_help boolean;v_optout boolean;v_spam boolean;v_reasons text[]:='{}';v_classification text;v_extracted jsonb:='{}';v_email text;v_name text;
begin
 if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501';end if;
 v_from=public.normalize_phone_e164(p_from_phone);v_to=public.normalize_phone_e164(p_to_phone);v_body=btrim(coalesce(p_body,''));
 if v_from is null or v_to is null or nullif(p_provider_message_id,'') is null or v_body='' then raise exception 'Invalid inbound SMS' using errcode='22023';end if;
 if not exists(select 1 from public.twilio_phone_numbers n join public.business_twilio_accounts a on a.id=n.business_twilio_account_id and a.business_id=n.business_id
  where n.business_id=p_business_id and n.phone_number_e164=v_to and n.status='active' and n.provisioning_status='active' and a.twilio_subaccount_sid=p_account_sid and a.provisioning_status='active') then
  raise exception 'Authenticated tenant number mapping does not match' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('twilio-message:'||p_provider_message_id,31));
 select * into v_existing from public.inbound_sms_messages where provider='twilio' and provider_message_id=p_provider_message_id;
 if found then
  if v_existing.business_id<>p_business_id or v_existing.to_phone_e164<>v_to or v_existing.from_phone_e164<>v_from then raise exception 'Message tenant mismatch' using errcode='42501';end if;
  return jsonb_build_object('duplicate',true,'message_id',v_existing.id,'business_id',v_existing.business_id,'customer_id',v_existing.customer_id,'reply',false);
 end if;
 -- Preferences are optional; they cannot override the authenticated tenant.
 select * into v_settings from public.business_inbound_sms_settings where business_id=p_business_id;
 v_settings.business_id=p_business_id;
 perform pg_advisory_xact_lock(hashtextextended(v_settings.business_id::text||':'||v_from,31));
 v_optout=upper(coalesce(p_opt_out_type,''))='STOP' or (coalesce(p_opt_out_type,'')='' and upper(v_body) in ('STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','REVOKE','OPTOUT'));
 v_start=upper(coalesce(p_opt_out_type,''))='START' or (coalesce(p_opt_out_type,'')='' and upper(v_body) in ('START','UNSTOP','YES'));
 v_help=upper(coalesce(p_opt_out_type,''))='HELP' or upper(v_body) in ('HELP','INFO');
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
  values(v_settings.business_id,coalesce(nullif(btrim(v_name),''),'SMS Lead'),case when v_name is null then right(v_from,4) else '' end,v_from,v_from,'sms',array['sms-lead']||case when v_spam then array['likely-spam'] else array[]::text[] end,'Inbound SMS','Created from inbound text. Original message is preserved in the SMS inbox.',true,case when v_optout then 'opted_out' when v_start then 'express' else 'inbound_contact' end,now(),case when v_optout then now() else null end,v_extracted,false)
  returning * into v_customer;
 elsif v_optout or v_start then
  update public.customers set sms_consent_status=case when v_optout then 'opted_out' else 'express' end,sms_opted_out_at=case when v_optout then now() else null end,sms_consent_recorded_at=now(),updated_at=now()
  where business_id=p_business_id and phone_normalized=v_from and not is_deleted;
 end if;
 select * into v_customer from public.customers where id=v_customer.id;

 insert into public.customer_sms_consents(business_id,customer_id,phone_e164,status,source,provider_message_id,evidence)
 values(v_settings.business_id,v_customer.id,v_from,case when v_optout then 'opted_out' when v_start then 'express' else 'inbound_contact' end,'inbound_sms',p_provider_message_id,jsonb_build_object('keyword',case when v_optout or v_start or v_help then upper(v_body) else null end,'provider_opt_out_type',p_opt_out_type))
 on conflict(business_id,phone_e164) do update set customer_id=excluded.customer_id,status=case when v_start then 'express' when not v_optout and customer_sms_consents.status='express' then 'express' when customer_sms_consents.status='opted_out' and excluded.status<>'opted_out' then customer_sms_consents.status else excluded.status end,source=excluded.source,provider_message_id=excluded.provider_message_id,evidence=excluded.evidence,updated_at=now();
 insert into public.inbound_sms_messages(business_id,customer_id,provider_message_id,from_phone_e164,to_phone_e164,body,classification,escalation_reasons,likely_spam,extracted_data)
 values(v_settings.business_id,v_customer.id,p_provider_message_id,v_from,v_to,v_body,v_classification,v_reasons,v_spam,v_extracted) returning * into v_message;
 insert into public.business_activity(business_id,action,entity_type,entity_id,summary)
 values(v_settings.business_id,case when v_classification='escalated' then 'inbound_sms_escalated' else 'inbound_sms_received' end,'customer',v_customer.id,case when v_classification='escalated' then 'Inbound customer text needs staff attention' when v_spam then 'Inbound text marked likely spam' else 'Inbound text received' end);
 return jsonb_build_object('duplicate',false,'message_id',v_message.id,'business_id',v_settings.business_id,'customer_id',v_customer.id,'classification',v_classification,'reply',false,'reply_body',case when 'emergency'=any(v_reasons) then v_settings.emergency_reply_body else v_settings.auto_reply_body end,'to',v_from,'from',v_to);
end$$;
revoke all on function public.process_inbound_sms(text,text,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.process_inbound_sms(text,text,text,text,uuid,text,text) to service_role;


notify pgrst,'reload schema';
commit;
