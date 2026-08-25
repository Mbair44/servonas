begin;

create or replace function public.protect_non_draft_invoice_children() returns trigger
language plpgsql set search_path=public as $$
declare
  v_invoice_id uuid;
  v_business_id uuid;
  v_status text;
  v_backfill text:=lower(coalesce(current_setting('servonas.allow_invoice_child_backfill', true), ''));
begin
  if v_backfill in ('on','true','1','yes') then
    if tg_op='DELETE' then
      return old;
    end if;
    return new;
  end if;
  v_invoice_id:=coalesce(new.invoice_id,old.invoice_id);
  v_business_id:=coalesce(new.business_id,old.business_id);
  select status into v_status from public.invoices where id=v_invoice_id and business_id=v_business_id;
  if v_status is distinct from 'draft' then
    raise exception 'Only draft invoice details can be changed' using errcode='23514';
  end if;
  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end $$;

commit;
