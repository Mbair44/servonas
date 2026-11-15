-- The tax-correct amendment wrapper receives complete booking_item rows from
-- add_rental_items_to_booking. Those rows use `id`, not `booking_item_id`.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.add_rental_items_to_booking_tax_correct(uuid,uuid,jsonb,integer,jsonb,text,text,uuid,jsonb)'::regprocedure)
    into definition;
  if definition is null or position('row->>''booking_item_id''' in definition)=0 then
    raise exception 'Expected immutable price override implementation was not found.';
  end if;
  definition:=replace(definition,'row->>''booking_item_id''','row->>''id''');
  execute definition;
end $$;
