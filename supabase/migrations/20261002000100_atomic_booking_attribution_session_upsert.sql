begin;

-- Session heartbeats can arrive concurrently from a page event, interval, and
-- lifecycle flush. Keep first-touch attribution immutable while atomically
-- accumulating session metrics and using the database clock for ordering.
create or replace function public.upsert_booking_attribution_session(
 p_business_id uuid,
 p_session_id uuid,
 p_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
 v_now timestamptz := clock_timestamp();
 v_increment bigint := case when coalesce(p_patch->>'duration_increment_milliseconds','') ~ '^\d+$' then (p_patch->>'duration_increment_milliseconds')::bigint else 0 end;
 v_has_increment boolean := p_patch ? 'duration_increment_milliseconds' and p_patch->>'duration_increment_milliseconds' is not null;
 v_page_increment integer := case when coalesce(p_patch->>'page_increment','') ~ '^\d+$' then (p_patch->>'page_increment')::integer else 0 end;
 v_engaged_page_increment integer := case when coalesce(p_patch->>'engaged_page_increment','') ~ '^\d+$' then (p_patch->>'engaged_page_increment')::integer else 0 end;
 v_interaction_increment integer := case when coalesce(p_patch->>'meaningful_interaction_increment','') ~ '^\d+$' then (p_patch->>'meaningful_interaction_increment')::integer else 0 end;
 v_final_flush boolean := coalesce((p_patch->>'duration_final_flush_received')::boolean,false);
begin
 if p_business_id is null or p_session_id is null or jsonb_typeof(p_patch) is distinct from 'object' then
  raise exception 'Invalid booking attribution session input' using errcode='22023';
 end if;

 insert into public.booking_attribution_sessions(
  id,business_id,first_landing_url,first_landing_path,first_referrer,gclid,gbraid,wbraid,fbclid,
  utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id,last_seen_at,updated_at,
  session_started_at,session_ended_at,entry_path,last_path,entry_page_type,last_page_type,
  page_count,engaged_page_count,total_session_duration_seconds,engaged_duration_seconds,
  total_session_duration_milliseconds,engaged_duration_milliseconds,duration_source,
  duration_final_flush_received,duration_last_flush_reason,browser,operating_system,device_type,
  first_interaction_type,first_interaction_label,first_interaction_identifier,first_interaction_path,
  first_interaction_at,time_to_first_interaction_milliseconds,meaningful_interaction_count,
  automated_classification,automated_classification_reason
 ) values (
  p_session_id,p_business_id,
  nullif(p_patch->>'first_landing_url',''),nullif(p_patch->>'first_landing_path',''),nullif(p_patch->>'first_referrer',''),nullif(p_patch->>'gclid',''),nullif(p_patch->>'gbraid',''),nullif(p_patch->>'wbraid',''),nullif(p_patch->>'fbclid',''),
  nullif(p_patch->>'utm_source',''),nullif(p_patch->>'utm_medium',''),nullif(p_patch->>'utm_campaign',''),nullif(p_patch->>'utm_content',''),nullif(p_patch->>'utm_term',''),nullif(p_patch->>'utm_id',''),v_now,v_now,
  v_now,case when v_final_flush then v_now else null end,nullif(p_patch->>'first_landing_path',''),nullif(p_patch->>'last_path',''),nullif(p_patch->>'entry_page_type',''),nullif(p_patch->>'last_page_type',''),
  greatest(v_page_increment,0),greatest(v_engaged_page_increment,0),round(greatest(v_increment,0)/1000.0),round(greatest(v_increment,0)/1000.0),
  case when v_has_increment then greatest(v_increment,0) else null end,case when v_has_increment then greatest(v_increment,0) else null end,nullif(p_patch->>'duration_source',''),
  v_final_flush,nullif(p_patch->>'duration_last_flush_reason',''),nullif(p_patch->>'browser',''),nullif(p_patch->>'operating_system',''),nullif(p_patch->>'device_type',''),
  nullif(p_patch->>'first_interaction_type',''),nullif(p_patch->>'first_interaction_label',''),nullif(p_patch->>'first_interaction_identifier',''),nullif(p_patch->>'first_interaction_path',''),
  case when nullif(p_patch->>'first_interaction_type','') is not null then v_now else null end,
  case when coalesce(p_patch->>'time_to_first_interaction_milliseconds','') ~ '^\d+$' then (p_patch->>'time_to_first_interaction_milliseconds')::bigint else null end,
  greatest(v_interaction_increment,0),case when nullif(p_patch->>'automated_classification','') in ('human_likely','automated_likely','unknown') then p_patch->>'automated_classification' else 'unknown' end,nullif(p_patch->>'automated_classification_reason','')
 )
 on conflict (id) do update set
  last_seen_at=greatest(public.booking_attribution_sessions.last_seen_at,v_now),
  updated_at=greatest(public.booking_attribution_sessions.updated_at,v_now),
  session_ended_at=case when v_final_flush then greatest(coalesce(public.booking_attribution_sessions.session_ended_at,v_now),v_now) else public.booking_attribution_sessions.session_ended_at end,
  first_landing_url=coalesce(public.booking_attribution_sessions.first_landing_url,excluded.first_landing_url),
  first_landing_path=coalesce(public.booking_attribution_sessions.first_landing_path,excluded.first_landing_path),
  first_referrer=coalesce(public.booking_attribution_sessions.first_referrer,excluded.first_referrer),
  gclid=coalesce(public.booking_attribution_sessions.gclid,excluded.gclid),gbraid=coalesce(public.booking_attribution_sessions.gbraid,excluded.gbraid),wbraid=coalesce(public.booking_attribution_sessions.wbraid,excluded.wbraid),fbclid=coalesce(public.booking_attribution_sessions.fbclid,excluded.fbclid),
  utm_source=coalesce(public.booking_attribution_sessions.utm_source,excluded.utm_source),utm_medium=coalesce(public.booking_attribution_sessions.utm_medium,excluded.utm_medium),utm_campaign=coalesce(public.booking_attribution_sessions.utm_campaign,excluded.utm_campaign),utm_content=coalesce(public.booking_attribution_sessions.utm_content,excluded.utm_content),utm_term=coalesce(public.booking_attribution_sessions.utm_term,excluded.utm_term),utm_id=coalesce(public.booking_attribution_sessions.utm_id,excluded.utm_id),
  entry_path=coalesce(public.booking_attribution_sessions.entry_path,excluded.entry_path),last_path=coalesce(excluded.last_path,public.booking_attribution_sessions.last_path),entry_page_type=coalesce(public.booking_attribution_sessions.entry_page_type,excluded.entry_page_type),last_page_type=coalesce(excluded.last_page_type,public.booking_attribution_sessions.last_page_type),
  page_count=greatest(coalesce(public.booking_attribution_sessions.page_count,0)+greatest(v_page_increment,0),0),engaged_page_count=greatest(coalesce(public.booking_attribution_sessions.engaged_page_count,0)+greatest(v_engaged_page_increment,0),0),
  total_session_duration_milliseconds=case when v_has_increment then greatest(coalesce(public.booking_attribution_sessions.total_session_duration_milliseconds,coalesce(public.booking_attribution_sessions.total_session_duration_seconds,0)*1000)+greatest(v_increment,0),0) else public.booking_attribution_sessions.total_session_duration_milliseconds end,
  engaged_duration_milliseconds=case when v_has_increment then greatest(coalesce(public.booking_attribution_sessions.engaged_duration_milliseconds,coalesce(public.booking_attribution_sessions.engaged_duration_seconds,0)*1000)+greatest(v_increment,0),0) else public.booking_attribution_sessions.engaged_duration_milliseconds end,
  total_session_duration_seconds=case when v_has_increment then round(greatest(coalesce(public.booking_attribution_sessions.total_session_duration_milliseconds,coalesce(public.booking_attribution_sessions.total_session_duration_seconds,0)*1000)+greatest(v_increment,0),0)/1000.0) else public.booking_attribution_sessions.total_session_duration_seconds end,
  engaged_duration_seconds=case when v_has_increment then round(greatest(coalesce(public.booking_attribution_sessions.engaged_duration_milliseconds,coalesce(public.booking_attribution_sessions.engaged_duration_seconds,0)*1000)+greatest(v_increment,0),0)/1000.0) else public.booking_attribution_sessions.engaged_duration_seconds end,
  duration_source=coalesce(excluded.duration_source,public.booking_attribution_sessions.duration_source),duration_final_flush_received=public.booking_attribution_sessions.duration_final_flush_received or v_final_flush,duration_last_flush_reason=coalesce(excluded.duration_last_flush_reason,public.booking_attribution_sessions.duration_last_flush_reason),
  browser=coalesce(excluded.browser,public.booking_attribution_sessions.browser),operating_system=coalesce(excluded.operating_system,public.booking_attribution_sessions.operating_system),device_type=coalesce(excluded.device_type,public.booking_attribution_sessions.device_type),
  first_interaction_type=coalesce(public.booking_attribution_sessions.first_interaction_type,excluded.first_interaction_type),first_interaction_label=coalesce(public.booking_attribution_sessions.first_interaction_label,excluded.first_interaction_label),first_interaction_identifier=coalesce(public.booking_attribution_sessions.first_interaction_identifier,excluded.first_interaction_identifier),first_interaction_path=coalesce(public.booking_attribution_sessions.first_interaction_path,excluded.first_interaction_path),first_interaction_at=coalesce(public.booking_attribution_sessions.first_interaction_at,excluded.first_interaction_at),time_to_first_interaction_milliseconds=coalesce(public.booking_attribution_sessions.time_to_first_interaction_milliseconds,excluded.time_to_first_interaction_milliseconds),meaningful_interaction_count=greatest(coalesce(public.booking_attribution_sessions.meaningful_interaction_count,0)+greatest(v_interaction_increment,0),0),
  automated_classification=case when public.booking_attribution_sessions.automated_classification='automated_likely' then 'automated_likely' else excluded.automated_classification end,automated_classification_reason=case when public.booking_attribution_sessions.automated_classification='automated_likely' then public.booking_attribution_sessions.automated_classification_reason else coalesce(excluded.automated_classification_reason,public.booking_attribution_sessions.automated_classification_reason) end
 where public.booking_attribution_sessions.business_id=p_business_id;

 if not found then
  raise exception 'Booking attribution session belongs to another business' using errcode='23505';
 end if;
end;
$$;

revoke all on function public.upsert_booking_attribution_session(uuid,uuid,jsonb) from public;
grant execute on function public.upsert_booking_attribution_session(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
