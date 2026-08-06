create table if not exists public.marketing_content_leads(
  content_code text primary key,
  click_count bigint not null default 0 check(click_count>=0),
  signup_count bigint not null default 0 check(signup_count>=0),
  first_clicked_at timestamptz not null default now(),
  last_clicked_at timestamptz not null default now(),
  last_signup_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_content_leads_code_check check(content_code~'^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$')
);

create table if not exists public.marketing_content_lead_signups(
  content_code text not null references public.marketing_content_leads(content_code) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  signed_up_at timestamptz not null default now(),
  primary key(content_code,user_id)
);

alter table public.marketing_content_leads enable row level security;
alter table public.marketing_content_lead_signups enable row level security;

create or replace function public.record_marketing_content_click(p_content_code text)
returns void language plpgsql security definer set search_path=public as $$
declare v_code text:=btrim(p_content_code);
begin
 if v_code!~'^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$' then raise exception 'Invalid marketing content code.';end if;
 insert into public.marketing_content_leads(content_code,click_count)
 values(v_code,1)
 on conflict(content_code) do update set click_count=marketing_content_leads.click_count+1,last_clicked_at=now(),updated_at=now();
end;$$;

create or replace function public.record_marketing_content_signup(p_content_code text,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_code text:=btrim(p_content_code);v_inserted integer;
begin
 if v_code!~'^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$' then return;end if;
 insert into public.marketing_content_leads(content_code) values(v_code) on conflict do nothing;
 insert into public.marketing_content_lead_signups(content_code,user_id) values(v_code,p_user_id) on conflict do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted=1 then update public.marketing_content_leads set signup_count=signup_count+1,last_signup_at=now(),updated_at=now() where content_code=v_code;end if;
end;$$;

revoke all on function public.record_marketing_content_click(text) from public;
revoke all on function public.record_marketing_content_signup(text,uuid) from public;
grant execute on function public.record_marketing_content_click(text) to service_role;
grant execute on function public.record_marketing_content_signup(text,uuid) to service_role;

create index if not exists marketing_content_leads_last_clicked_idx on public.marketing_content_leads(last_clicked_at desc);
create index if not exists marketing_content_lead_signups_user_idx on public.marketing_content_lead_signups(user_id);
