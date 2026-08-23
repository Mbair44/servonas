import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("party rental booking moves focus to the upsell primary action",async()=>{
 const code=await read("components/PartyRentalBookingClient.tsx");
 assert.match(code,/const upsellPrimaryActionRef=useRef<HTMLButtonElement>\(null\)/);
 assert.match(code,/primaryAction=upsellPrimaryActionRef\.current/);
  assert.match(code,/dialog\.scrollIntoView\(\{behavior:"smooth",block:"center"\}\)/);
 assert.match(code,/window\.setTimeout\(\(\)=>primaryAction\.focus\(\{preventScroll:true\}\),120\)/);
 assert.match(code,/ref=\{upsellPrimaryActionRef\}/);
 assert.match(code,/className="rental-upsell-dialog rental-upsell-inline"/);
 assert.match(code,/Would you like to add these to your party\?/);
});

test("party rental booking marks all customer-required fields clearly",async()=>{
 const code=await read("components/PartyRentalBookingClient.tsx");
 assert.match(code,/Choose your party date/);
 assert.match(code,/Party date: \{eventDateLabel\}/);
 assert.match(code,/First name <span className="booking-required"/);
 assert.match(code,/Last name <span className="booking-required"/);
 assert.match(code,/Email <span className="booking-required"/);
 assert.match(code,/Phone <span className="booking-required"/);
 assert.match(code,/Delivery address <span className="booking-required"/);
 assert.match(code,/City <span className="booking-required"/);
 assert.match(code,/ZIP code <span className="booking-required"/);
 assert.match(code,/agreementAccepted" value="true" required aria-required="true"/);
});
