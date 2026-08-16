import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {websiteRequestNotificationContent} from "../lib/communications/websiteRequestEmailService.ts";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("website consultation notification contains submitted follow-up details and escapes HTML",()=>{
 const content=websiteRequestNotificationContent({businessId:"business-1",requestId:"request-1",businessName:"Lily Patch Floral",recipient:"owner@example.com",customerName:"Jane <Smith>",customerPhone:"+14805551234",customerEmail:"jane@example.com",serviceName:"Wedding flowers",serviceAddress:"123 Main Street",description:"Bouquets & centerpieces",preferredAt:"September 12"});
 assert.match(content.subject,/Jane <Smith>/);
 assert.match(content.text,/Wedding flowers/);
 assert.match(content.text,/September 12/);
 assert.match(content.html,/Jane &lt;Smith&gt;/);
 assert.match(content.html,/Bouquets &amp; centerpieces/);
});

test("website request action saves the lead before attempting tenant-scoped email notification",async()=>{
 const source=await read("app/sites/[siteSlug]/actions.ts");
 assert.match(source,/website_service_requests"\)\.insert\([\s\S]*?\.select\("id"\)\.single\(\)/);
 assert.match(source,/const recipient=business\?\.email\?\.trim\(\)\|\|ownerProfile\?\.email\?\.trim\(\)/);
 assert.match(source,/await sendWebsiteRequestBusinessNotification\(\{/);
 assert.ok(source.indexOf("const {data:request,error}=await db.from(\"website_service_requests\")")<source.indexOf("await sendWebsiteRequestBusinessNotification"));
});

test("website consultation email uses the existing Resend configuration, reply-to, idempotency, and safe diagnostics",async()=>{
 const source=await read("lib/communications/websiteRequestEmailService.ts");
 assert.match(source,/rentalEmailDeliveryIsLive/);
 assert.match(source,/RESEND_API_KEY/);
 assert.match(source,/EMAIL_FROM/);
 assert.match(source,/reply_to:notification\.customerEmail/);
 assert.match(source,/"Idempotency-Key":`website-request\/\$\{notification\.requestId\}`/);
 assert.match(source,/Website consultation notification email sent/);
 assert.match(source,/Website consultation notification email failed/);
 assert.doesNotMatch(source,/customerName:notification\.customerName/);
 assert.doesNotMatch(source,/description:notification\.description/);
});
