begin;

-- A generated party-rental website is booking-first. Repair existing tenants
-- whose website is live but whose booking record was disabled or lost its slug.
update public.booking_settings bs
set enabled=true,
    public_slug=coalesce(nullif(btrim(bs.public_slug),''),ws.public_slug),
    updated_at=now()
from public.business_website_settings ws
join public.businesses b on b.id=ws.business_id
where bs.business_id=ws.business_id
  and b.industry_profile='party_rental'
  and (ws.status='published' or ws.domain_status='connected');

commit;
