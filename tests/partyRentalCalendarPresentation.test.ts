import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("party-rental calendar remains a compact seven-column grid",async()=>{
 const styles=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
 assert.match(styles,/\.party-rental-booking \.weekdays,\.party-rental-booking \.days\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(styles,/\.party-rental-booking \.calendar\{box-sizing:border-box;width:min\(100%,760px\)/);
 assert.match(styles,/\.party-rental-booking,\.party-rental-booking>\*,\.rental-storefront-header>\*,\.rental-storefront-date,\.booking-items-section,\.inventory-gallery,\.inventory-card\{min-width:0;max-width:100%\}/);
 assert.match(styles,/\.rental-storefront-date\{display:grid;width:100%[^}]*overflow:hidden\}/);
 assert.match(styles,/\.party-rental-booking \.day\{display:grid;min-width:0;min-height:68px/);
 assert.match(styles,/@media\(max-width:560px\).*\.party-rental-booking \.day\{min-height:40px/s);
 assert.match(styles,/\.selection-bar span\{overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
});

test("selected item availability errors name the rental without exposing reservation details",async()=>{
 const source=await readFile(new URL("../components/PartyRentalBookingClient.tsx",import.meta.url),"utf8");
 assert.match(source,/setBookingError\(`\$\{item\.name\} is unavailable \$\{eventDateLabel\}\. Choose another date or a similar rental\.`\)/);
 assert.match(source,/Your current cart conflicts with \$\{formatLongDate\(date\)\}/);
 assert.match(source,/setCalendarNotice\(`Choose an event date to check \$\{item\.name\} availability\.`\)/);
});

test("past rental dates use each business's configured timezone",async()=>{
 const [client,booking,checkout,domainBooking,domainCheckout]=await Promise.all([
  readFile(new URL("../components/PartyRentalBookingClient.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/book/[businessSlug]/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/book/[businessSlug]/booking/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/sites/domain/[domain]/booking/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/sites/domain/[domain]/booking/checkout/page.tsx",import.meta.url),"utf8"),
 ]);
 assert.match(client,/import \{dateInTimeZone\} from "@\/lib\/bookingTime"/);
 assert.match(client,/const todayIso=dateInTimeZone\(new Date\(\),timezone\)/);
 for(const source of [booking,checkout,domainBooking,domainCheckout])assert.match(source,/timezone=\{settings\.timezone\?\?"America\/Phoenix"\}/);
});
