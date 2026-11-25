-- Run only after the complete migration chain in an isolated database.
-- This fixture is deliberately inert until test harness placeholders are supplied.
begin;
do $$ begin
  if current_setting('app.customer_merge_test_mode',true) is distinct from 'on' then
    raise exception 'Set app.customer_merge_test_mode=on before running merge integration fixtures';
  end if;
end $$;
-- Harness-owned fixture setup and assertions belong below this guard. It must
-- never target a shared, staging, or production database by accident.
rollback;
