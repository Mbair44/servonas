import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=(path:string)=>readFile(path,"utf8");

test("party rental booking keeps one shared event-date state across browsing and reservation",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/bookingDateStateKey=\(slug:string\)=>`servonas\.rental-booking-date\.\$\{slug\}`/);
 assert.match(source,/bookingCartStateKey=\(slug:string\)=>`servonas\.rental-booking-cart\.\$\{slug\}`/);
 assert.match(source,/window\.localStorage\.getItem\(bookingDateStateKey\(businessSlug\)\)/);
 assert.match(source,/const \[dateStateHydrated,setDateStateHydrated\]=useState\(false\);/);
 assert.match(source,/const dateHydrationStarted=useRef\(false\);/);
 assert.match(source,/if\(typeof window==="undefined"\|\|dateHydrationStarted\.current\)return;dateHydrationStarted\.current=true;/);
 assert.match(source,/const stored=initialDateState\?\.date\?initialDateState:raw\?JSON\.parse\(raw\)/);
 assert.match(source,/useEffect\(\(\)=>\{if\(typeof window==="undefined"\|\|!dateStateHydrated\)return;window\.localStorage\.setItem\(bookingDateStateKey\(businessSlug\),JSON\.stringify\(\{date,endDate,startTime,endTime\}\)\);\},\[businessSlug,date,endDate,startTime,endTime,dateStateHydrated\]\);/);
 assert.match(source,/window\.localStorage\.getItem\(bookingCartStateKey\(businessSlug\)\)/);
 assert.match(source,/useEffect\(\(\)=>\{if\(typeof window==="undefined"\)return;let frame=0;try\{const raw=window\.localStorage\.getItem\(bookingCartStateKey\(businessSlug\)\);if\(!raw\)\{setCartStateHydrated\(true\);return;\}const stored=JSON\.parse\(raw\) as Record<string,unknown>;const next=Object\.fromEntries\(Object\.entries\(stored\)\.filter\(\(\[itemId,value\]\)=>inventory\.some\(item=>item\.id===itemId\)&&Number\.isFinite\(Number\(value\)\)&&Number\(value\)>0\)\.map\(\(\[itemId,value\]\)=>\[itemId,Math\.max\(0,Math\.floor\(Number\(value\)\)\)\]\)\);if\(Object\.keys\(next\)\.length\)\{setQuantities\(current=>Object\.keys\(current\)\.length\?\{\.{3}next,\.{3}current\}:next\);frame=window\.requestAnimationFrame\(\(\)=>setCartStateHydrated\(true\)\);return\(\)=>window\.cancelAnimationFrame\(frame\);\}setCartStateHydrated\(true\);\}catch\{setCartStateHydrated\(true\);\}\},\[businessSlug,inventory\]\);/);
 assert.match(source,/useEffect\(\(\)=>\{if\(typeof window==="undefined"\|\|!cartStateHydrated\)return;window\.localStorage\.setItem\(bookingCartStateKey\(businessSlug\),JSON\.stringify\(quantities\)\);\},\[businessSlug,quantities,cartStateHydrated\]\);/);
 assert.match(source,/const storedStartTime=typeof stored\.startTime==="string"&&timePattern\.test\(stored\.startTime\)\?stored\.startTime:null;/);
 assert.match(source,/storedStartTime>=hours\.start&&storedStartTime<=hours\.end/);
 assert.match(source,/if\(storedPeriodValid\)\{setEndDate\(storedEndDate\);setStartTime\(storedStartTime!\);setEndTime\(storedEndTime!\);\}/);
 assert.match(source,/chooseStart\(storedStartTime&&storedStartTime>=hours\.start&&storedStartTime<=hours\.end\?storedStartTime:hours\.start,stored\.date\)/);
 assert.match(source,/function applyDate\(value:string,source:"date_first"\|"rental_first",changing=false\)/);
 assert.match(source,/if\(hours\)chooseStart\(hours\.start,value,value\)/);
 assert.match(source,/event_date_changed/);
});

test("party rental booking uses explicit reserve actions instead of auto-adding on date selection",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/function reserveItem\(item:Item\)/);
 assert.match(source,/const nextQuantities=\{\.{3}quantities,\[item\.id\]:Math\.max\(1,quantities\[item\.id\]\?\?1\)\};/);
 assert.match(source,/setQuantities\(nextQuantities\);persistBookingState\(nextQuantities\);/);
 assert.match(source,/function noteInventoryInteraction\(item:Item,source:"browse"\|"adjust"\|"reserve"="browse"\)/);
 assert.match(source,/setAvailabilityItemId\(item\.id\);/);
 assert.match(source,/if\(source==="browse"\)setFocusedItemId\(item\.id\);/);
 assert.match(source,/trackBookingFunnel\(businessSlug,"inventory_item_view"/);
 assert.match(source,/trackBookingFunnel\(businessSlug,"inventory_item_clicked"/);
 assert.match(source,/trackBookingFunnel\(businessSlug,"reserve_clicked"/);
 assert.match(source,/trackBookingFunnel\(businessSlug,"item_added_to_cart"/);
 assert.match(source,/if\(!date\)\{setAvailabilityItemId\(item\.id\);setFocusedItemId\(item\.id\);setBookingError\("Choose your party date first\."\);focusDatePicker\("rental_first"\);return;\}/);
 assert.match(source,/className="catalog-add-button" onClick=\{\(\)=>reserveItem\(item\)\} disabled=\{isUnavailable\} title=\{isUnavailable\?unavailableHint:undefined\}>\{isUnavailable\?"Choose another day or item":`Add to Party — \$\{money\(item\.daily_price_cents\)\}`\}/);
 assert.doesNotMatch(source,/See Available Rentals/);
 assert.doesNotMatch(source,/chooseDate\(value\)[\s\S]*setQuantities/s);
});

test("party rental booking supports a date range, item-aware calendar, and checkout arrival time selection",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/const chooseStart=useCallback\(\(value:string,baseDate=date,rangeEndOverride=endDate,preserveRangeEnd=false\)=>/);
 assert.match(source,/if\(baseDate&&rangeEndOverride&&preserveRangeEnd&&rangeEndOverride>=baseDate\)\{setBookingError\(""\);setEndDate\(rangeEndOverride\);setEndTime\(value\);return;\}/);
 assert.match(source,/function chooseEndDate\(value:string\)/);
 assert.match(source,/if\(startTime\)chooseStart\(startTime,date,next,true\);/);
 assert.match(source,/function chooseCalendarDay\(value:string\)/);
  assert.match(source,/if\(date&&endDate>date&&\(value===date\|\|value===endDate\|\|\(value>date&&value<endDate\)\)\)\{applyDate\(value,source,true\);return;\}/);
 assert.match(source,/if\(hours\)chooseStart\(hours\.start,value,value\)/);
 assert.match(source,/Choose your dates/);
 assert.match(source,/Availability calendar for \$\{availabilityItem\.name\}/);
 assert.match(source,/Arrival time/);
 assert.match(source,/No end time is required\./);
 assert.match(source,/dateStateHydrated&&date&&startTime&&endDate&&endTime/);
 assert.match(source,/catalog-inline-cart-button/);
 assert.match(source,/quantity-picker-wrap"><div className="quantity-picker">[\s\S]*catalog-inline-cart-button/s);
 assert.doesNotMatch(source,/const matchesAvailability=!date\|\|available\(item\)>0;/);
 assert.match(source,/const qty=quantities\[item\.id\]\?\?0,max=available\(item\),pricing=priced\(item\),dimensions=rentalDimensions\(item\),isUnavailable=Boolean\(date&&max<=0\),statusLabel=!date\?"Choose your party date, then add this to your party\.":checkingAvailability\?"Checking availability…":isUnavailable\?`Unavailable for \$\{eventDateLabel\}`:`✓ Available for \$\{eventDateLabel\}`/);
 assert.match(source,/isUnavailable&&<p className="inventory-unavailable-tooltip" role="note" title=\{unavailableHint\}>\{unavailableHint\}<\/p>/);
 assert.match(source,/className=\{`inventory-card \$\{qty\?"selected":""\}\$\{focusedItemId===item\.id\?" focused":""\}\$\{descriptionExpanded\?" description-expanded":""\}\$\{isUnavailable\?" unavailable":""\}`\}/);
 assert.match(source,/className="catalog-add-button" onClick=\{\(\)=>reserveItem\(item\)\} disabled=\{isUnavailable\} title=\{isUnavailable\?unavailableHint:undefined\}/);
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
 assert.match(styles,/\.inventory-card\.unavailable/);
 assert.match(styles,/\.inventory-unavailable-tooltip/);
 assert.match(styles,/\.rental-storefront-header/);
});

test("party rental booking blocks empty checkout and uses a storefront-style party summary",async()=>{
 const [source,styles]=await Promise.all([
  read("components/PartyRentalBookingClient.tsx"),
  read("app/globals.css"),
 ]);
 assert.match(source,/import \{bookingAttributionSession,bookingAttributionValues,trackBookingFunnel\} from "\.\/TenantBookingFunnelTracker";/);
 assert.match(source,/const selectionFromQuantities=\(sourceQuantities:Record<string,number>\)=>inventory\.filter\(item=>\(sourceQuantities\[item\.id\]\?\?0\)>0\);/);
 assert.match(source,/function openCheckout\(\)\{const currentSelection=selectionFromQuantities\(quantities\),currentSelectionCount=currentSelection\.reduce/);
 assert.match(source,/if\(!date\)\{setBookingError\("Choose your party date before viewing your cart\."\);setShowCheckout\(false\);focusDatePicker\("date_first"\);return;\}/);
 assert.match(source,/if\(!currentSelection\.length\)\{setBookingError\("Add at least one rental to your party before checking out\."\);/);
 assert.match(source,/const findSuggestedUpsells=useCallback\(\(options\?:\{ignoreDismissed\?:boolean\}\)=>/);
 assert.match(source,/const \[showCheckout,setShowCheckout\]=useState\(false\),\[partyNotice,setPartyNotice\]=useState\(""\),\[checkoutNavigationCount,setCheckoutNavigationCount\]=useState\(0\);/);
 assert.match(source,/const \[selectedUpsellIds,setSelectedUpsellIds\]=useState<string\[\]>\(\[\]\);/);
 assert.match(source,/function focusReservationHeading\(\)\{let attempts=0;if\(checkoutFocusFrameRef\.current!==null\)cancelAnimationFrame\(checkoutFocusFrameRef\.current\);const focusCheckout=\(\)=>\{const heading=checkoutHeadingRef\.current;if\(!heading\)\{if\(attempts<12\)\{attempts\+=1;checkoutFocusFrameRef\.current=requestAnimationFrame\(focusCheckout\);\}\s*return;\}checkoutFocusFrameRef\.current=null;window\.setTimeout\(\(\)=>heading\.focus\(\{preventScroll:true\}\),120\);/);
 assert.match(source,/useEffect\(\(\)=>\{if\(!showCheckout\)return;focusReservationHeading\(\);return\(\)=>\{if\(checkoutFocusFrameRef\.current!==null\)\{cancelAnimationFrame\(checkoutFocusFrameRef\.current\);checkoutFocusFrameRef\.current=null;\}\};\},\[checkoutNavigationCount,showCheckout\]\);/);
 assert.match(source,/const resolveAbsoluteUrl=\(value:string\)=>\{if\(typeof window==="undefined"\)return value;try\{return new URL\(value,window\.location\.origin\)\.toString\(\);\}catch\{return value;\}\};/);
 assert.match(source,/function persistBookingState\(nextQuantities=quantities,nextDate=date,nextEndDate=endDate,nextStartTime=startTime,nextEndTime=endTime\)\{if\(typeof window==="undefined"\)return;window\.localStorage\.setItem\(bookingCartStateKey\(businessSlug\),JSON\.stringify\(nextQuantities\)\);window\.localStorage\.setItem\(bookingDateStateKey\(businessSlug\),JSON\.stringify\(\{date:nextDate,endDate:nextEndDate,startTime:nextStartTime,endTime:nextEndTime\}\)\);\}/);
 assert.match(source,/function showReservationPage\(itemCount:number,nextQuantities=quantities\)\{setBookingError\(""\);trackBookingFunnel\(businessSlug,"booking_started"/);
 assert.match(source,/persistBookingState\(nextQuantities\);if\(typeof window!=="undefined"&&checkoutUrl&&window\.parent&&window\.parent!==window\)/);
 assert.match(source,/nextUrl\.searchParams\.set\("cartState",JSON\.stringify\(nextQuantities\)\);nextUrl\.searchParams\.set\("dateState",JSON\.stringify\(\{date,endDate,startTime,endTime\}\)\)/);
 assert.match(source,/window\.parent\.postMessage\(\{type:"servonas:open-booking-page",url:nextUrl\.toString\(\)\},"\*"\);return;\}setCheckoutNavigationCount\(current=>current\+1\);setShowCheckout\(true\);/);
 assert.match(source,/function goToCart\(\)\{openCheckout\(\);\}/);
 assert.match(source,/function handleCartButtonClick\(event:\{preventDefault\(\):void;stopPropagation\(\):void\}\)\{event\.preventDefault\(\);event\.stopPropagation\(\);goToCart\(\);\}/);
 assert.match(source,/if\(!currentSelection\.length\)\{setBookingError\("Add at least one rental to your party before checking out\."\);setShowCheckout\(false\);return;\}showReservationPage\(currentSelectionCount,quantities\);\}/);
 assert.match(source,/const suggestedCheckoutUpsells=useMemo\(\(\)=>showCheckout\|\|initialCheckout\?findSuggestedUpsells\(\):\[\],\[findSuggestedUpsells,initialCheckout,showCheckout\]\);/);
 assert.match(source,/useEffect\(\(\)=>\{if\(!suggestedCheckoutUpsells\.length\)\{setUpsells\(\[\]\);return;\}setUpsells\(current=>current\.length===suggestedCheckoutUpsells\.length&&current\.every\(\(item,index\)=>item\.id===suggestedCheckoutUpsells\[index\]\?\.id\)\?current:suggestedCheckoutUpsells\);\},\[suggestedCheckoutUpsells\]\);/);
 assert.match(source,/useEffect\(\(\)=>\{setSelectedUpsellIds\(\[\]\);\},\[upsells\]\);/);
 assert.match(source,/className="rental-upsell-dialog rental-upsell-inline"/);
 assert.match(source,/Pick any extras you want, then continue to your reservation\./);
 assert.match(source,/type="checkbox" checked=\{checked\} onChange=\{\(\)=>setSelectedUpsellIds\(current=>current\.includes\(item\.id\)\?current\.filter\(value=>value!==item\.id\):\[\.\.\.current,item\.id\]\)\}/);
 assert.match(source,/disabled=\{!selectedUpsellIds\.length\}/);
 assert.match(source,/if\(!selectedUpsellIds\.length\)return;/);
 assert.match(source,/for\(const item of upsells\.filter\(upsell=>selectedUpsellIds\.includes\(upsell\.id\)\)\)\{nextQuantities\[item\.id\]=Math\.max\(1,Math\.min\(\(quantities\[item\.id\]\?\?0\)\+1,item\.allow_quantity\?available\(item\):1\)\);dismissedUpsells\.current\.add\(item\.id\);\}setQuantities\(nextQuantities\);persistBookingState\(nextQuantities\);setSelectedUpsellIds\(\[\]\);setUpsells\(\[\]\);/);
 assert.match(source,/for\(const item of upsells\)dismissedUpsells\.current\.add\(item\.id\);setSelectedUpsellIds\(\[\]\);setUpsells\(\[\]\);/);
 assert.doesNotMatch(source,/pendingUpsellAction/);
 assert.doesNotMatch(source,/pendingBooking/);
 assert.equal((source.match(/onClick=\{goToCart\}/g)??[]).length,2);
 assert.match(source,/selected\.length>0&&!showCheckout&&<div className="selection-bar visible">/);
 assert.match(source,/const checkoutEmptyState=<section className="rental-checkout-screen">/);
 assert.match(source,/const shouldRenderCheckoutScreen=showCheckout\|\|\(initialCheckout&&cartStateHydrated\);/);
 assert.match(source,/shouldRenderCheckoutScreen\?\(selected\.length\?<section className="rental-checkout-screen">\{reservationContent\}<\/section>:checkoutEmptyState\):/);
 assert.match(source,/rental-checkout-screen-header/);
 assert.match(styles,/\.rental-checkout-screen\{/);
 assert.match(styles,/\.rental-checkout-screen-header\{/);
 assert.match(source,/Back to rentals/);
 assert.match(source,/View Party/);
 assert.match(source,/Your Party/);
});

test("party rental storefront and embedded website point checkout to the dedicated booking route",async()=>{
 const [bookingPage,websiteSource,checkoutPage,domainBookingPage,domainCheckoutPage,frameSource]=await Promise.all([
  read("app/book/[businessSlug]/page.tsx"),
  read("components/BusinessWebsite.tsx"),
  read("app/book/[businessSlug]/booking/page.tsx"),
  read("app/sites/domain/[domain]/booking/page.tsx"),
  read("app/sites/domain/[domain]/booking/checkout/page.tsx"),
  read("components/EmbeddedBookingFrame.tsx"),
 ]);
 assert.match(bookingPage,/catalogUrl=\{`\/book\/\$\{businessSlug\}`\}/);
 assert.match(websiteSource,/const absolutizeUrl=\(value:string\)=>\/\^https\?:\\\/\\\/\/i\.test\(value\)\?value:`https:\/\/servonas\.com\$\{value\.startsWith\("\/"\)\?"":"\/"\}\$\{value\}`;/);
 assert.match(websiteSource,/const customDomainBaseUrl=site\.customDomain\?`https:\/\/\$\{site\.customDomain\}`:null;/);
 assert.match(websiteSource,/const bookingBaseUrl=customDomainBaseUrl&&site\.bookingEnabled\?`\$\{customDomainBaseUrl\}\/booking`:site\.bookingUrl\?absolutizeUrl\(site\.bookingUrl\):null;/);
 assert.match(websiteSource,/const bookingCheckoutUrl=customDomainBaseUrl&&site\.bookingEnabled\?`\$\{customDomainBaseUrl\}\/booking\/checkout`:bookingBaseUrl\?`\$\{bookingBaseUrl\.replace\(\/\\\/\$\/,""\)\}\/booking`:null;/);
 assert.match(websiteSource,/checkoutUrl=\$\{encodeURIComponent\(bookingCheckoutUrl\?\?bookingBaseUrl\)\}/);
 assert.match(checkoutPage,/initialCheckout/);
 assert.match(checkoutPage,/function parseCartState\(value:string\|undefined\)/);
 assert.match(checkoutPage,/function parseDateState\(value:string\|undefined\)/);
 assert.match(checkoutPage,/const initialCartState=parseCartState\(query\.cartState\);/);
 assert.match(checkoutPage,/const initialDateState=parseDateState\(query\.dateState\);/);
 assert.match(checkoutPage,/catalogUrl=\{`\/book\/\$\{businessSlug\}`\}/);
 assert.match(checkoutPage,/initialCartState=\{initialCartState\} initialDateState=\{initialDateState\}/);
 assert.match(checkoutPage,/Reservation checkout/);
 assert.match(domainBookingPage,/checkoutUrl=\{query\.checkoutUrl\?\?"\/booking\/checkout"\}/);
 assert.match(domainBookingPage,/catalogUrl="\/booking"/);
 assert.match(domainCheckoutPage,/initialCheckout/);
 assert.match(domainCheckoutPage,/catalogUrl="\/booking"/);
 assert.match(frameSource,/servonas:open-booking-page/);
 assert.match(frameSource,/window\.location\.assign\(nextUrl\)/);
});

test("party rental availability effect no longer emits analytics on every availability refresh",async()=>{
 const source=await read("components/PartyRentalBookingClient.tsx");
 assert.doesNotMatch(source,/trackBookingFunnel\(businessSlug,"rental_availability_checked"/);
 assert.doesNotMatch(source,/trackBookingFunnel\(businessSlug,"available_inventory_viewed"/);
 assert.doesNotMatch(source,/trackBookingFunnel\(businessSlug,nextAvailable>0\?"rental_available":"rental_unavailable"/);
});
