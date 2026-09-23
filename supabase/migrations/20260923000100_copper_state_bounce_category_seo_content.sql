-- Data-only update for the tenant-requested Copper State Bounce category copy.
update public.category_website_pages
set
 title='Bounce House Rentals in Gilbert, AZ',
 intro='Copper State Bounce offers bounce house rentals for birthdays, school events, family gatherings, and other celebrations in Gilbert. Browse available inflatables online, choose a rental for your event, and reserve your date with delivery available throughout Gilbert and the East Valley.',
 seo_title='Bounce House Rentals in Gilbert, AZ | Copper State Bounce',
 meta_description='Browse bounce house rentals for Gilbert, AZ birthdays, parties, and events. Check online availability and reserve delivery with Copper State Bounce.',
 updated_at=now()
where business_id='cb25acc0-3623-4c06-9041-89a88f4ad6ed' and slug='bounce-house';

update public.category_website_pages
set
 title='Water Slide Rentals in Gilbert, AZ',
 intro='Bring water-slide fun to Arizona birthday parties, backyard gatherings, and summer events with Copper State Bounce. Browse inflatable water slide availability online, choose a rental for your event, and reserve your Gilbert or East Valley delivery date.',
 seo_title='Water Slide Rentals in Gilbert, AZ | Copper State Bounce',
 meta_description='Find inflatable water slide rentals for Gilbert, AZ parties and summer events. Check availability online and reserve delivery with Copper State Bounce.',
 updated_at=now()
where business_id='cb25acc0-3623-4c06-9041-89a88f4ad6ed' and slug='inflatable-water-slides';

update public.category_website_pages
set
 title='Obstacle Course Rentals in Gilbert, AZ',
 intro='Make birthdays, school events, and group celebrations more active with inflatable obstacle course rentals from Copper State Bounce. Check availability online, choose a course for your party, and reserve delivery in Gilbert and the East Valley.',
 seo_title='Obstacle Course Rentals in Gilbert, AZ | Copper State Bounce',
 meta_description='Explore inflatable obstacle course rentals for Gilbert, AZ parties, school events, and celebrations. Check availability online with Copper State Bounce.',
 updated_at=now()
where business_id='cb25acc0-3623-4c06-9041-89a88f4ad6ed' and slug='obstacle-course';
