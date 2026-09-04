import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("promotion code is carried from tenant booking routes through canonical checkout",async()=>{
 const [booking,checkout,domainBooking,domainCheckout,client,api]=await Promise.all([
  read("app/book/[businessSlug]/page.tsx"),read("app/book/[businessSlug]/booking/page.tsx"),read("app/sites/domain/[domain]/booking/page.tsx"),read("app/sites/domain/[domain]/booking/checkout/page.tsx"),read("components/PartyRentalBookingClient.tsx"),read("app/api/checkout/route.ts"),
 ]);
 for(const source of [booking,checkout,domainBooking,domainCheckout])assert.match(source,/initialPromotionCode=\{query\.promotion\}/);
 assert.match(client,/nextUrl\.searchParams\.set\("promotion",promoCode\.trim\(\)\)/);
 assert.match(client,/promoCode:appliedPromo\?\.code\?\?promoCode\.trim\(\)/);
 assert.match(api,/validateRentalPromo\(supabase/);
 assert.match(api,/discount_cents:discountCents/);
});
