-- The original pattern used two backslashes in a standard SQL string. That
-- makes PostgreSQL require a literal backslash before the domain suffix and
-- rejects valid addresses such as owner@example.com.

alter table public.business_recruiting_settings
  drop constraint if exists business_recruiting_settings_notification_email_check;

alter table public.business_recruiting_settings
  add constraint business_recruiting_settings_notification_email_check
  check(
    notification_email is null
    or notification_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  );
