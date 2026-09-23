import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("financial reporting preserves member access and uses validated server access for platform admins",async()=>{
 const [page,migration]=await Promise.all([read("app/app/[businessSlug]/page.tsx"),read("supabase/migrations/20260915000400_repair_sales_customer_metrics.sql")]);
 assert.match(page,/role==="platform_admin"\?\(getSupabaseAdmin\(\)\?\?supabase\):supabase/);
 assert.match(page,/financialDb\.rpc\("financial_dashboard_summary",\{p_business_id:business\.id/);
 assert.match(migration,/auth\.role\(\)<>\'service_role\'.*has_business_role\(p_business_id,array\['owner','admin','manager'\]\).*is_servonas_platform_admin\(\)/s);
 assert.match(migration,/raise exception 'Financial dashboard denied' using errcode='42501'/);
 assert.match(page,/message:financialError\.message,details:financialError\.details,hint:financialError\.hint,businessId:business\.id/);
});

test("financial dashboard guard and sales details use the repaired canonical access and customer email",async()=>{
 const [migration,workspace]=await Promise.all([read("supabase/migrations/20260916000100_fix_financial_dashboard_and_sales_details.sql"),read("lib/workspace.ts")]);
 assert.match(migration,/create or replace function public\.financial_dashboard_summary/);
 assert.match(migration,/auth\.role\(\)<>'service_role'.*has_business_role\(p_business_id,array\['owner','admin','manager'\]\).*is_servonas_platform_admin\(\)/s);
 assert.match(migration,/'customerKey',case when nullif\(lower\(btrim\(c\.email\)\),''\) is not null/);
 assert.doesNotMatch(migration,/b\.email/);
 assert.match(migration,/c\.business_id=p_business_id/);
 assert.match(workspace,/requireWorkspace = cache\(async function requireWorkspace/);
});

test("Meta CAPI keeps the canonical durable claim and logs resolvable PostgREST errors",async()=>{
 const [sender,migration]=await Promise.all([read("lib/metaConversions.ts"),read("supabase/migrations/20260915000500_repair_meta_conversion_events.sql")]);
 assert.match(sender,/from\("meta_conversion_events"\)\.insert/);
 assert.match(sender,/claimError\?\.code==="23505"/);
 assert.match(sender,/message:claimError\.message,details:claimError\.details,hint:claimError\.hint/);
 assert.match(migration,/create table if not exists public\.meta_conversion_events/);
 assert.match(migration,/unique \(business_id,event_name,event_id\)/);
 assert.match(migration,/grant select,insert,update on public\.meta_conversion_events to service_role/);
 assert.match(migration,/notify pgrst,'reload schema'/);
});

test("funnel event writes guarantee their composite session parent and retain strict event validation",async()=>{
 const [route,schema,constraint]=await Promise.all([read("app/api/public-booking/[businessSlug]/funnel/route.ts"),read("supabase/migrations/20260817000100_booking_funnel_attribution.sql"),read("supabase/migrations/20260915000200_sync_current_booking_funnel_events.sql")]);
 const parent=route.indexOf('from("booking_attribution_sessions").upsert(sessionSeed');
 const event=route.indexOf('from("booking_funnel_events").insert(row)');
 assert.ok(parent>0&&event>parent);
 assert.match(schema,/foreign key \(business_id, attribution_session_id\) references public\.booking_attribution_sessions\(business_id,id\)/);
 assert.match(schema,/inventory_item_id uuid references/);
 assert.doesNotMatch(schema,/inventory_item_id uuid not null/);
 for(const name of ["booking_started","booking_date_selection_started","promotion_inventory_viewed","initiate_checkout"])assert.match(constraint,new RegExp(`'${name}'`));
 assert.match(route,/sessionId,event,inventoryItemId,serviceId,code:error\.code,message:error\.message,details:error\.details,hint:error\.hint,source:/);
 assert.match(route,/normalizeMarketingSource\(body\.attribution\)/);
});

test("concurrent initial heartbeats use the composite conflict target and preserve first touch",async()=>{
 const route=await read("app/api/public-booking/[businessSlug]/funnel/route.ts");
 assert.match(route,/\.upsert\(sessionRow,\{onConflict:"business_id,id",ignoreDuplicates:true\}\)/);
 assert.match(route,/existing\?db\.from\("booking_attribution_sessions"\)\.update\(sessionRow\)/);
 assert.match(route,/stage:"session_race_update"/);
 assert.match(route,/first_landing_url:clean\(body\.landingUrl/);
});

test("checkout funnel persistence and Meta CAPI remain independent operations",async()=>{
 const booking=await read("components/PartyRentalBookingClient.tsx");
 assert.match(booking,/trackBookingFunnel\(businessSlug,initialPromotionCode\?"initiate_checkout":"checkout_started"/);
 assert.match(booking,/trackMetaBrowserAndServerEvent\(businessSlug,"InitiateCheckout"/);
});
