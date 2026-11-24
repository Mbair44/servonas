-- Read-only mobile inbox summaries. No Twilio call, message mutation, or read
-- receipt is performed here. SECURITY DEFINER is limited to office roles and
-- avoids exposing arbitrary tenant rows through an aggregate query.
begin;
create or replace function public.mobile_list_customer_conversations(
 p_business_id uuid,p_before_at timestamptz default null,p_before_id uuid default null,p_limit integer default 25
) returns table(conversation_key text,display_name text,phone_number text,latest_preview text,latest_at timestamptz,latest_id uuid,latest_direction text,unread_count bigint)
language sql stable security definer set search_path=public as $$
 with scoped as (
  select m.*,coalesce(m.received_at,m.sent_at,m.created_at) as occurred_at,
   case when m.customer_id is not null then 'customer:'||m.customer_id::text else 'phone:'||m.counterparty_phone_e164 end as conversation_key
  from public.customer_messages m where m.business_id=p_business_id
 ), grouped as (
  select conversation_key,max(occurred_at) latest_at,count(*) filter(where direction='inbound' and read_at is null) unread_count
  from scoped group by conversation_key
 ), latest as (
  select distinct on (s.conversation_key) s.conversation_key,s.id,s.counterparty_phone_e164,s.body,s.direction,s.occurred_at,s.customer_id
  from scoped s order by s.conversation_key,s.occurred_at desc,s.id desc
 )
 select l.conversation_key,coalesce(c.company_name,nullif(concat_ws(' ',c.first_name,c.last_name),''),l.counterparty_phone_e164),l.counterparty_phone_e164,l.body,g.latest_at,l.id,l.direction,g.unread_count
 from grouped g join latest l on l.conversation_key=g.conversation_key left join public.customers c on c.id=l.customer_id and c.business_id=p_business_id
 where public.has_business_role(p_business_id,array['owner','admin','manager'])
  and (p_before_at is null or (g.latest_at,l.id)<(p_before_at,p_before_id))
 order by g.latest_at desc,l.id desc limit least(greatest(p_limit,1),51)
$$;
revoke all on function public.mobile_list_customer_conversations(uuid,timestamptz,uuid,integer) from public;
grant execute on function public.mobile_list_customer_conversations(uuid,timestamptz,uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
