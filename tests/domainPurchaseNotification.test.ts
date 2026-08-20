import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {customerDomainPurchaseEmailContent,domainPurchaseEmailContent} from "../lib/communications/domainPurchaseEmailService.ts";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("domain purchase email identifies the customer, domain, and costs",()=>{
 const content=domainPurchaseEmailContent({businessId:"business-1",businessName:"Lily Patch Floral",businessSlug:"lily-patch",businessEmail:"owner@example.com",domain:"lilypatchfloral.com",providerOrderId:"order-1",providerCost:11.25,customerRenewalPrice:12.94,currency:"USD"},"https://servonas.com");
 assert.match(content.subject,/lilypatchfloral\.com/);
 assert.match(content.text,/Lily Patch Floral/);
 assert.match(content.text,/\$11\.25/);
 assert.match(content.text,/\$12\.94\/year/);
 assert.match(content.text,/\/app\/admin\/domains/);
});

test("customer domain purchase email explains the Servonas order and possible registrar follow-up",()=>{
 const content=customerDomainPurchaseEmailContent({businessId:"business-1",businessName:"Lily Patch Floral",businessSlug:"lily-patch",businessEmail:"owner@example.com",domain:"lilypatchfloral.com",providerOrderId:"order-1",providerCost:11.25,customerRenewalPrice:12.94,currency:"USD"},"https://servonas.com");
 assert.match(content.subject,/Your domain is being connected/);
 assert.match(content.text,/Servonas registered lilypatchfloral\.com/);
 assert.match(content.text,/Vercel or the registrar/);
 assert.match(content.text,/Estimated renewal price: \$12\.94\/year/);
 assert.match(content.text,/\/app\/lily-patch\/settings\/website/);
});

test("accepted Vercel purchases claim one owner notification without retrying the purchase",async()=>{
 const [actions,migration,email]=await Promise.all([read("app/app/[businessSlug]/settings/website/actions.ts"),read("supabase/migrations/20260814000400_domain_purchase_notifications.sql"),read("lib/communications/domainPurchaseEmailService.ts")]);
 assert.match(migration,/purchase_notification_status/);
 assert.match(migration,/purchase_notification_sent_at/);
 assert.match(actions,/purchase_notification_status:"pending"/);
 assert.match(actions,/\.in\("purchase_notification_status",\["pending","failed"\]\)/);
 assert.match(actions,/await notifyAcceptedDomainPurchase\(admin,order\.id,business\)/);
 assert.match(email,/idempotencyKey:`domain-purchase\/\$\{notification\.providerOrderId\}`/);
 assert.match(email,/idempotencyKey:`domain-purchase-customer\/\$\{notification\.providerOrderId\}`/);
 assert.doesNotMatch(email,/buyVercelDomain/);
});
