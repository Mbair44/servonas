import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
test("promotion pages preserve eligible inventory in the date-first booking handoff",async()=>{const [landing,styles,domainRoute,hostedRoute,loader,hostedBooking,domainBooking,tracker,funnel]=await Promise.all([read("components/PromotionLanding.tsx"),read("app/globals.css"),read("app/sites/domain/[domain]/[promotionSlug]/page.tsx"),read("app/sites/[siteSlug]/[promotionSlug]/page.tsx"),read("app/book/[businessSlug]/loadPublicBookingData.ts"),read("app/book/[businessSlug]/page.tsx"),read("app/sites/domain/[domain]/booking/page.tsx"),read("components/TenantBookingFunnelTracker.tsx"),read("lib/bookingFunnel.ts")]);assert.match(landing,/Claim \{offer\} — Check My Date/);assert.match(landing,/promotionId=/);assert.match(landing,/returnTo=/);assert.match(landing,/View full website/);assert.match(landing,/promotion-trust/);assert.match(landing,/<details className="promotion-details">/);assert.match(domainRoute,/landingType="promotion"/);assert.match(hostedRoute,/landingType="promotion"/);for(const source of [loader,domainRoute,hostedRoute]){assert.match(source,/loadPromotionEligibility/);assert.match(source,/filterPromotionInventory/);}assert.match(hostedBooking,/loadPublicBookingData\(businessSlug,query\.promotion,query\.promotionId\)/);assert.match(domainBooking,/loadPublicBookingData\(bookingSlug,query\.promotion,query\.promotionId\)/);assert.match(hostedBooking,/We couldn&apos;t load this offer&apos;s rentals/);assert.match(domainBooking,/We couldn&apos;t load this offer&apos;s rentals/);assert.match(tracker,/promotion_primary_cta_clicked/);assert.match(tracker,/promotion_item_selected/);assert.match(funnel,/promotion_landing_view/);assert.match(styles,/\.promotion-rental-card\{grid-template-columns:112px/);assert.match(styles,/\.promotion-rental-image img\{[^}]*object-fit:contain/);});

test("Copper State campaign variant keeps offer and conversion controls focused",async()=>{
 const landing=await read("components/PromotionLanding.tsx");
 const sticky=await read("components/PromotionStickyCta.tsx");
 assert.match(landing,/promotion\.slug==="fall-party-special"/);
 assert.match(landing,/Save Up to \$75 on Your Party Rental/);
 assert.match(landing,/Check My Date/);
 assert.match(landing,/Popular Rentals/);
 assert.match(landing,/Party Add-ons/);
 assert.match(landing,/See All Rentals/);
 assert.match(landing,/Check Availability/);
 assert.match(sticky,/Save up to \$75 · Check My Date/);
 assert.match(sticky,/promotion_primary_cta_clicked/);
});
