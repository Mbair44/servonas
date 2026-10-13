import test from "node:test";
import assert from "node:assert/strict";
import {cleanGiveawaySlug,csvCell,giveawayCsv,giveawayQrUrl,normalizeGiveawayEmail,validGiveawayEmail,winnerCommitment} from "../lib/eventGiveaway.ts";

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
