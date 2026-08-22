import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=(path:string)=>readFile(path,"utf8");

test("party rental booking keeps one shared event-date state across browsing and reservation",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/bookingDateStateKey=\(slug:string\)=>`servonas\.rental-booking-date\.\$\{slug\}`/);
 assert.match(source,/window\.localStorage\.getItem\(bookingDateStateKey\(businessSlug\)\)/);
 assert.match(source,/window\.localStorage\.setItem\(bookingDateStateKey\(businessSlug\),JSON\.stringify\(\{date,endDate,startTime,endTime\}\)\)/);
 assert.match(source,/function restoreStoredDateSelection\(stored:\{date\?:string;endDate\?:string;startTime\?:string;endTime\?:string\}\)/);
 assert.match(source,/if\(hasStoredTimes&&storedStartTime===hours\.start&&storedEndTime\)/);
 assert.match(source,/chooseStart\(hours\.start,stored\.date\)/);
 assert.match(source,/const selectedAvailabilitySignature=useMemo\(\(\)=>selected\.map\(item=>`\$\{item\.id\}:\$\{quantities\[item\.id\]\?\?0\}`\)/);
 assert.match(source,/function applyDate\(value:string,source:"date_first"\|"rental_first",changing=false\)/);
 assert.match(source,/if\(hours\)chooseStart\(hours\.start,value,value\)/);
 assert.match(source,/event_date_changed/);
});

test("party rental booking uses explicit reserve actions instead of auto-adding on date selection",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/function reserveItem\(item:Item\)/);
 assert.match(source,/function noteInventoryInteraction\(item:Item,source:"browse"\|"adjust"\|"reserve"="browse"\)/);
 assert.match(source,/trackBookingFunnel\(businessSlug,"inventory_item_view"/);
 assert.match(source,/trackBookingFunnel\(businessSlug,"reserve_clicked"/);
 assert.match(source,/trackBookingFunnel\(businessSlug,"item_added_to_cart"/);
 assert.match(source,/if\(!date\)\{setAvailabilityItemId\(item\.id\);setFocusedItemId\(item\.id\);setBookingError\("Choose your party date first\."\);focusDatePicker\("rental_first"\);return;\}/);
 assert.match(source,/\{`Add to Party — \$\{money\(item\.daily_price_cents\)\}`\}/);
 assert.doesNotMatch(source,/See Available Rentals/);
 assert.doesNotMatch(source,/chooseDate\(value\)[\s\S]*setQuantities/s);
});

test("party rental booking supports a date range, item-aware calendar, and checkout arrival time selection",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/function chooseEndDate\(value:string\)/);
 assert.match(source,/function chooseCalendarDay\(value:string\)/);
 assert.match(source,/if\(date&&endDate>date&&\(value===date\|\|value===endDate\|\|\(value>date&&value<endDate\)\)\)\{applyDate\(value,source,true\);return;\}/);
 assert.match(source,/Choose your dates/);
 assert.match(source,/Availability calendar for \$\{availabilityItem\.name\}/);
 assert.match(source,/Arrival time/);
 assert.match(source,/catalog-inline-cart-button/);
 assert.match(source,/quantity-picker-wrap"><div className="quantity-picker">[\s\S]*catalog-inline-cart-button/s);
 assert.doesNotMatch(source,/\{!showCheckout&&<button type="button" className="catalog-inline-cart-button"/);
 assert.match(source,/Complete your reservation/);
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
 assert.match(source,/function findSuggestedUpsell\(options\?:\{ignoreDismissed\?:boolean\}\)/);
 assert.match(source,/const \[showCheckout,setShowCheckout\]=useState\(false\),\[partyNotice,setPartyNotice\]=useState\(""\),\[checkoutNavigationCount,setCheckoutNavigationCount\]=useState\(0\);/);
assert.match(source,/function focusReservationHeading\(\)\{let attempts=0;if\(checkoutFocusFrameRef\.current!==null\)cancelAnimationFrame\(checkoutFocusFrameRef\.current\);const focusCheckout=\(\)=>\{const heading=checkoutHeadingRef\.current;if\(!heading\)\{if\(attempts<10\)\{attempts\+=1;checkoutFocusFrameRef\.current=requestAnimationFrame\(focusCheckout\);\}return;\}/);
assert.match(source,/useEffect\(\(\)=>\{if\(!showCheckout\)return;focusReservationHeading\(\);return\(\)=>\{if\(checkoutFocusFrameRef\.current!==null\)\{cancelAnimationFrame\(checkoutFocusFrameRef\.current\);checkoutFocusFrameRef\.current=null;\}\};\},\[checkoutNavigationCount,showCheckout\]\);/);
assert.match(source,/function showReservationPage\(itemCount:number\)\{setBookingError\(""\);setUpsell\(null\);setCheckoutNavigationCount\(current=>current\+1\);setShowCheckout\(true\);trackBookingFunnel\(businessSlug,"booking_started"[\s\S]*window\.setTimeout\(\(\)=>focusReservationHeading\(\),0\);\}/);
assert.match(source,/function handleCartButtonClick\(event:\{preventDefault\(\):void;stopPropagation\(\):void\}\)\{event\.preventDefault\(\);event\.stopPropagation\(\);openCheckout\(\);\}/);
assert.match(source,/const suggestion=findSuggestedUpsell\(\{ignoreDismissed:true\}\);if\(suggestion\)\{pendingUpsellAction\.current="checkout";setUpsell\(suggestion\);return;\}/);
assert.match(source,/return;\}showReservationPage\(selected\.length\);\}/);
assert.match(source,/pendingUpsellAction\.current="submit"/);
assert.match(source,/setQuantity\(upsell,1\);dismissedUpsells\.current\.add\(upsell\.id\);pendingBooking\.current=null;pendingUpsellAction\.current=null;showReservationPage\(selected\.length\+1\);/);
assert.match(source,/dismissedUpsells\.current\.add\(upsell\.id\);pendingBooking\.current=null;pendingUpsellAction\.current=null;showReservationPage\(selected\.length\);/);
assert.doesNotMatch(source,/Add to cart and continue[\s\S]*completeBooking\(data,upsell\)/s);
assert.equal((source.match(/showReservationPage\(selected\.length(?:\+1)?\)/g)??[]).length,3);
 assert.match(source,/selected\.length>0&&!showCheckout&&<div className="selection-bar visible">/);
 assert.match(source,/View Party/);
 assert.match(source,/Your Party/);
});

test("party rental availability effect uses a stable cart signature so successful checks do not refetch forever",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/selectedAvailabilitySignature/);
 assert.match(source,/\[availabilityItemId,businessSlug,date,endDate,focusedItemId,flowSource,quantities,selectedAvailabilitySignature,startTime,endTime\]/);
 assert.doesNotMatch(source,/\[availabilityItemId,businessSlug,date,endDate,focusedItemId,flowSource,quantities,selected,startTime,endTime\]/);
});
