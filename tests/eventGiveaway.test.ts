import test from "node:test";
import assert from "node:assert/strict";
import {cleanGiveawaySlug,csvCell,giveawayCsv,giveawayQrUrl,normalizeGiveawayEmail,validGiveawayEmail,winnerCommitment} from "../lib/eventGiveaway.ts";
import {readFile} from "node:fs/promises";

test("giveaway helpers normalize public input and preserve QR attribution",()=>{
 assert.equal(cleanGiveawaySlug(" Main Event Gilbert! "),"main-event-gilbert");
 assert.equal(normalizeGiveawayEmail(" Entry@Example.com "),"entry@example.com");
 assert.equal(validGiveawayEmail("entry@example.com"),true);
 const url=new URL(giveawayQrUrl("https://copperstatebounce.com","main-event", "sandwich-sign"));
 assert.equal(url.pathname,"/giveaways/main-event");assert.equal(url.searchParams.get("utm_medium"),"qr");assert.equal(url.searchParams.get("utm_campaign"),"sandwich-sign");
});
test("giveaway CSV escapes entrant data and winner commitment is stable",()=>{
 assert.equal(csvCell('A "quote"'), '"A ""quote"""');
 assert.match(giveawayCsv([{first_name:"Ada",email:"a@example.com",phone:null,email_marketing_consent:false,sms_marketing_consent:true,created_at:"2026-10-30"}]),/"Ada"/);
 assert.equal(winnerCommitment("g","e","n"),winnerCommitment("g","e","n"));
});
test("giveaway lifecycle keeps the shared discount independent after closure",async()=>{
 const actions=await readFile(new URL("../app/app/[businessSlug]/marketing/giveaways/actions.ts",import.meta.url),"utf8");
 assert.match(actions,/status==="published"&&g\.discount_id/);assert.doesNotMatch(actions,/is_active:status==="published"/);
});
test("entry handling uses exclusive end time, Turnstile action and only emails inserted entries",async()=>{
 const route=await readFile(new URL("../app/api/giveaways/entry/route.ts",import.meta.url),"utf8"),form=await readFile(new URL("../components/GiveawayEntryForm.tsx",import.meta.url),"utf8"),seed=await readFile(new URL("../supabase/migrations/20261013000400_seed_csb_main_event_giveaway.sql",import.meta.url),"utf8");
 assert.match(route,/now>=new Date\(g\.entry_ends_at\)/);assert.match(route,/action:"giveaway_entry"/);assert.match(route,/if\(entry&&d\)/);assert.match(form,/action:"giveaway_entry"/);assert.match(seed,/'2026-10-31T07:00:00Z'/);assert.match(seed,/do nothing/);
});
