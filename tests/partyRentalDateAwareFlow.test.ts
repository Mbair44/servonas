import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=(path:string)=>readFile(path,"utf8");

test("party rental booking keeps one shared event-date state across browsing and reservation",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/bookingDateStateKey=\(slug:string\)=>`servonas\.rental-booking-date\.\$\{slug\}`/);
 assert.match(source,/window\.localStorage\.getItem\(bookingDateStateKey\(businessSlug\)\)/);
 assert.match(source,/window\.localStorage\.setItem\(bookingDateStateKey\(businessSlug\),JSON\.stringify\(\{date,endDate,startTime,endTime\}\)\)/);
 assert.match(source,/function applyDate\(value:string,source:"date_first"\|"rental_first",changing=false\)/);
 assert.match(source,/if\(hours\)chooseStart\(hours\.start,value\)/);
 assert.match(source,/event_date_changed/);
});

test("party rental booking uses explicit reserve actions instead of auto-adding on date selection",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/function reserveItem\(item:Item\)/);
 assert.match(source,/function noteInventoryInteraction\(item:Item,source:"browse"\|"adjust"\|"reserve"="browse"\)/);
 assert.match(source,/trackBookingFunnel\(businessSlug,"inventory_item_view"/);
 assert.match(source,/trackBookingFunnel\(businessSlug,"reserve_clicked"/);
 assert.match(source,/trackBookingFunnel\(businessSlug,"item_added_to_cart"/);
 assert.match(source,/if\(!date\)\{setBookingError\("Choose your party date first\."\);focusDatePicker\("rental_first"\);return;\}/);
 assert.match(source,/\{`Add to Party — \$\{money\(item\.daily_price_cents\)\}`\}/);
 assert.doesNotMatch(source,/See Available Rentals/);
 assert.doesNotMatch(source,/chooseDate\(value\)[\s\S]*setQuantities/s);
});

test("party rental booking surfaces unavailable alternatives and conflict messaging",async()=>{
 const [source,styles]=await Promise.all([
  read("components/PartyRentalBookingClient.tsx"),
  read("app/globals.css"),
 ]);
 assert.match(source,/Your current cart conflicts with \$\{formatLongDate\(date\)\}/);
 assert.match(source,/setPartyNotice\(`Added \$\{item\.name\} to your party\.`\)/);
 assert.match(styles,/\.rental-date-pill/);
 assert.match(styles,/\.inventory-availability-status\.available/);
 assert.match(styles,/\.rental-storefront-header/);
});

test("party rental booking blocks empty checkout and uses a storefront-style party summary",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/function openCheckout\(\)\{if\(!selected\.length\)\{setBookingError\("Add at least one rental to your party before checking out\."\);/);
 assert.match(source,/selected\.length>0&&!showCheckout&&<div className="selection-bar visible">/);
 assert.match(source,/View Party/);
 assert.match(source,/Your Party/);
});
