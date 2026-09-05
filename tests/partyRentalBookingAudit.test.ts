import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("public rental catalog uses a date-first four-step booking journey",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/Step 1 of 4 · Event date/);
 assert.match(source,/When is your event\?/);
 assert.match(source,/1 <span>Date<\/span>/);
 assert.match(source,/2 <span>Rentals<\/span>/);
 assert.match(source,/3 <span>Review<\/span>/);
 assert.match(source,/4 <span>Checkout<\/span>/);
 assert.match(source,/Your event date/);
 assert.match(source,/Step 2 of 4 · Rentals/);
 assert.match(source,/Step 3 of 4 · Review/);
});

test("rentals remain browseable before a date without entering the booking",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/const visible=useMemo\(\(\)=>inventory\.filter/);
 assert.match(source,/Choose a date to check availability/);
 assert.match(source,/setBookingError\(""\);setCalendarNotice\(`/);
 assert.match(source,/focusDatePicker\("rental_first"\);return;/);
 assert.match(source,/`Add to Booking — \$\{money\(item\.daily_price_cents\)\}`/);
 assert.doesNotMatch(source,/0 in your party/);
 assert.match(source,/\{selectedCount>0&&<div className="catalog-count">Your booking/);
});

test("rental cards keep discovery controls and progressively disclose details",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/const descriptionLineLimit=2/);
 assert.match(source,/View details/);
 assert.match(source,/Hide details/);
 assert.match(source,/className="rental-category-filter"/);
 assert.match(source,/className="catalog-search"/);
 assert.match(source,/promotionalMultiDay=pricing\.rules\.allowMultiDay/);
 assert.match(source,/visibleMultiDayMessage=promotionalMultiDay\|\|pricing\.rentalDays>1\?multiDayMessage:null/);
});

test("mobile booking layout keeps the calendar and cards within the viewport",async()=>{
 const styles=await read("app/globals.css");
 assert.match(styles,/@media\(max-width:560px\).*\.rental-booking-journey li span\{display:none\}/s);
 assert.match(styles,/@media\(max-width:560px\).*\.party-rental-booking \.day\{min-height:40px/s);
 assert.match(styles,/@media\(max-width:560px\).*\.inventory-card img,\.inventory-image-placeholder\{height:200px\}/s);
 assert.match(styles,/\.party-rental-booking,\.party-rental-booking>\*,\.rental-storefront-header>\*,\.rental-storefront-date,\.booking-items-section,\.inventory-gallery,\.inventory-card\{min-width:0;max-width:100%\}/);
});
