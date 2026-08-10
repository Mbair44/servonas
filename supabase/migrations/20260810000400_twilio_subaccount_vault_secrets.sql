begin;

create extension if not exists supabase_vault with schema vault;

alter table public.business_twilio_accounts
 add column if not exists webhook_secret_id uuid,
 add column if not exists webhook_secret_status text not null default 'missing',
 add column if not exists webhook_secret_version integer not null default 0,
 add column if not exists webhook_secret_updated_at timestamptz;

alter table public.business_twilio_accounts
 drop constraint if exists business_twilio_accounts_webhook_secret_status_check;
alter table public.business_twilio_accounts
 add constraint business_twilio_accounts_webhook_secret_status_check
 check(webhook_secret_status in('missing','available','rotation_required','error'));

create table if not exists public.twilio_webhook_secret_audit_events(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 business_twilio_account_id uuid not null references public.business_twilio_accounts(id) on delete cascade,
 action text not null check(action in('store','read','delete','rotate','reconcile')),
 outcome text not null check(outcome in('succeeded','failed')),
 error_code text,
 created_at timestamptz not null default now()
);
create index if not exists twilio_webhook_secret_audit_business_idx
 on public.twilio_webhook_secret_audit_events(business_id,created_at desc);
alter table public.twilio_webhook_secret_audit_events enable row level security;
create policy "platform admins read Twilio secret audit metadata"
 on public.twilio_webhook_secret_audit_events for select to authenticated
 using(public.is_servonas_platform_admin());
revoke insert,update,delete on public.twilio_webhook_secret_audit_events from anon,authenticated;

create or replace function public.store_twilio_subaccount_auth_token(
 p_business_id uuid,p_subaccount_sid text,p_auth_token text,p_action text default 'store'
) returns table(secret_status text,secret_version integer,secret_updated_at timestamptz)
language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare v_account public.business_twilio_accounts%rowtype;v_secret_id uuid;v_version integer;v_now timestamptz:=now();
begin
 if p_auth_token is null or length(p_auth_token)<20 or length(p_auth_token)>128 then raise exception using errcode='22023',message='Invalid provider credential.';end if;
 if p_action not in('store','rotate','reconcile') then raise exception using errcode='22023',message='Invalid secret action.';end if;
 select * into v_account from public.business_twilio_accounts where business_id=p_business_id and twilio_subaccount_sid=p_subaccount_sid for update;
 if not found then raise exception using errcode='P0002',message='Twilio account mapping not found.';end if;
 if v_account.webhook_secret_id is null then
  v_secret_id:=vault.create_secret(p_auth_token,'servonas_twilio_'||p_business_id::text,'Twilio subaccount webhook validation token');
 else
  v_secret_id:=v_account.webhook_secret_id;
  perform vault.update_secret(v_secret_id,p_auth_token,'servonas_twilio_'||p_business_id::text,'Twilio subaccount webhook validation token');
 end if;
 v_version:=greatest(v_account.webhook_secret_version,0)+1;
 update public.business_twilio_accounts set webhook_secret_id=v_secret_id,webhook_secret_status='available',webhook_secret_version=v_version,webhook_secret_updated_at=v_now,updated_at=v_now where id=v_account.id;
 insert into public.twilio_webhook_secret_audit_events(business_id,business_twilio_account_id,action,outcome) values(p_business_id,v_account.id,p_action,'succeeded');
 return query select 'available'::text,v_version,v_now;
end;$$;

create or replace function public.get_twilio_subaccount_auth_token(p_business_id uuid,p_subaccount_sid text)
returns text language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare v_account public.business_twilio_accounts%rowtype;v_secret text;
begin
 select * into v_account from public.business_twilio_accounts where business_id=p_business_id and twilio_subaccount_sid=p_subaccount_sid and webhook_secret_status='available';
 if not found or v_account.webhook_secret_id is null then return null;end if;
 select decrypted_secret into v_secret from vault.decrypted_secrets where id=v_account.webhook_secret_id;
 if v_secret is null then return null;end if;
 -- Do not write one audit row per webhook; that would turn normal SMS volume into
 -- unbounded database write amplification. Lifecycle mutations remain audited.
 return v_secret;
end;$$;

create or replace function public.delete_twilio_subaccount_auth_token(p_business_id uuid,p_subaccount_sid text)
returns void language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare v_account public.business_twilio_accounts%rowtype;
begin
 select * into v_account from public.business_twilio_accounts where business_id=p_business_id and twilio_subaccount_sid=p_subaccount_sid for update;
 if not found then raise exception using errcode='P0002',message='Twilio account mapping not found.';end if;
 if v_account.webhook_secret_id is not null then delete from vault.secrets where id=v_account.webhook_secret_id;end if;
 update public.business_twilio_accounts set webhook_secret_id=null,webhook_secret_status='missing',webhook_secret_updated_at=now(),updated_at=now() where id=v_account.id;
 insert into public.twilio_webhook_secret_audit_events(business_id,business_twilio_account_id,action,outcome) values(p_business_id,v_account.id,'delete','succeeded');
end;$$;

revoke all on function public.store_twilio_subaccount_auth_token(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.get_twilio_subaccount_auth_token(uuid,text) from public,anon,authenticated;
revoke all on function public.delete_twilio_subaccount_auth_token(uuid,text) from public,anon,authenticated;
grant execute on function public.store_twilio_subaccount_auth_token(uuid,text,text,text) to service_role;
grant execute on function public.get_twilio_subaccount_auth_token(uuid,text) to service_role;
grant execute on function public.delete_twilio_subaccount_auth_token(uuid,text) to service_role;

comment on column public.business_twilio_accounts.webhook_secret_id is 'Opaque Supabase Vault reference only; never a Twilio credential.';
comment on table public.twilio_webhook_secret_audit_events is 'Non-secret audit metadata. Credential values are never recorded.';

notify pgrst,'reload schema';
commit;
