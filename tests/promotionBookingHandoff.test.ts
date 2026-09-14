import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("promotion code is carried from tenant booking routes through canonical checkout",async()=>{
 const [booking,checkout,domainBooking,domainCheckout,client,api]=await Promise.all([
  read("app/book/[businessSlug]/page.tsx"),read("app/book/[businessSlug]/booking/page.tsx"),read("app/sites/domain/[domain]/booking/page.tsx"),read("app/sites/domain/[domain]/booking/checkout/page.tsx"),read("components/PartyRentalBookingClient.tsx"),read("app/api/checkout/route.ts"),
 ]);
 for(const source of [booking,checkout,domainBooking,domainCheckout])assert.match(source,/initialPromotionCode=\{query\.promotion\}/);
 assert.match(client,/const carriedPromotionCode=appliedPromo\?\.code\?\?activePromoCode/);
 assert.match(client,/nextUrl\.searchParams\.set\("promotion",carriedPromotionCode\)/);
 assert.match(client,/promoCode:appliedPromo\?\.code\?\?""/);
 assert.match(client,/const \[promoCode,setPromoCode\]=useState\(""\)/);
 assert.match(client,/\[activePromoCode,setActivePromoCode\]=useState\(initialPromotionCode\?\?""\)/);
 assert.match(client,/appliedPromo\.automatic\?"Landing-page offer applied automatically\. ":""/);
 assert.match(api,/validateRentalPromo\(supabase/);
 assert.match(api,/discount_cents:discountCents/);
});

test("cart changes discard stale promo quotes and revalidate the active code",async()=>{
 const client=await read("components/PartyRentalBookingClient.tsx");
 assert.match(client,/promoQuote\?\.quoteKey===promoQuoteKey\?promoQuote:null/);
 assert.match(client,/selected\.map\(item=>\[item\.id,quantities\[item\.id\],priced\(item\)\.totalUnitPriceCents,operatorPricing\(item\)\.chargeCents\]\)/);
 assert.match(client,/\[promoQuoteKey,promoAttempt,dateStateHydrated\]/);
 assert.match(client,/current=false;controller\.abort\(\)/);
 assert.match(client,/disabled=\{submitting\|\|promoPending/);
});
