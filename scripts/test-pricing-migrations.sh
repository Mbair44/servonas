#!/usr/bin/env bash
set -euo pipefail
name="servonas-pricing-migration-$RANDOM"
dir="$(mktemp -d)"
cleanup(){ docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT
cat >"$dir/bootstrap.sql" <<'SQL'
create extension if not exists pgcrypto;
create schema auth; create table auth.users(id uuid primary key);
create role anon; create role authenticated; create role service_role;
create table public.businesses(id uuid primary key default gen_random_uuid(),name text not null default 'Test business',is_deleted boolean not null default false);
create table public.bookings(id uuid primary key default gen_random_uuid());
create table public.business_entitlements(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),entitlement_key text not null,status text not null,starts_at timestamptz not null default now(),ends_at timestamptz,grace_period_ends_at timestamptz,source text not null default 'migration',version integer not null default 1,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.business_platform_subscriptions(business_id uuid primary key references public.businesses(id),stripe_customer_id text,stripe_subscription_id text,stripe_price_id text,status text not null default 'trialing',trial_ends_at timestamptz,current_period_ends_at timestamptz,cancel_at_period_end boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create function public.has_business_role(uuid,text[]) returns boolean language sql stable as $$select true$$;
create function public.is_servonas_platform_admin() returns boolean language sql stable as $$select true$$;
create function auth.uid() returns uuid language sql stable as $$select '00000000-0000-0000-0000-000000000099'::uuid$$;
create table public.platform_business_admin_events(id uuid primary key default gen_random_uuid(),business_id uuid,business_name text,event_type text,actor_user_id uuid,metadata jsonb not null default '{}'::jsonb);
create table public.twilio_phone_numbers(id uuid primary key default gen_random_uuid(),business_id uuid not null,twilio_phone_number_sid text, status text not null default 'active',provisioning_status text not null default 'active');
create table public.business_twilio_accounts(business_id uuid primary key,twilio_subaccount_sid text,provisioning_status text);
create table public.business_inbound_sms_settings(business_id uuid primary key,enabled boolean not null default true);
create table public.business_voice_settings(business_id uuid primary key,enabled boolean not null default true,missed_call_sms_enabled boolean not null default true);
create table public.business_missed_call_settings(business_id uuid primary key,enabled boolean not null default true);
create table public.jobs(id uuid primary key default gen_random_uuid(),business_id uuid not null);
create table public.job_communication_events(id uuid primary key default gen_random_uuid(),job_id uuid not null,channel text,status text,suppression_reason text,error_message text);
SQL
docker run -d --name "$name" -e POSTGRES_PASSWORD=postgres -v "$dir":/work postgres:16-alpine >/dev/null
for i in $(seq 1 30); do docker exec "$name" pg_isready -U postgres >/dev/null && break; sleep 1; done
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <"$dir/bootstrap.sql"
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <supabase/migrations/20261122000100_three_tier_pricing_phase_b.sql
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <supabase/migrations/20261122000200_three_tier_platform_fee_lifecycle.sql
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <supabase/migrations/20261122000300_platform_fee_reconciliation.sql
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <supabase/migrations/20261122000400_platform_fee_refunds_disputes.sql
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <supabase/migrations/20261123000100_platform_fee_application_fee_identity.sql
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <supabase/migrations/20261123000200_platform_fee_dispute_adjustments.sql
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <supabase/migrations/20261123000300_tenant_billing_dashboard_access.sql
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <supabase/migrations/20261123000400_pricing_tenant_migration_workflow.sql
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <supabase/migrations/20261123000500_subscription_webhook_receipts.sql
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <supabase/migrations/20261123000600_starter_twilio_resource_resolution.sql
docker exec "$name" psql -v ON_ERROR_STOP=1 -U postgres -c "insert into public.businesses(id) values('00000000-0000-0000-0000-000000000001'); select plan_key,rollout_enabled from public.business_pricing_profiles;"
