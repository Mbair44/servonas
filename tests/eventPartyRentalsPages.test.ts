import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("event-party-rentals industry page highlights rental-specific workflows",async()=>{
 const [page,index]=await Promise.all([
  read("app/industries/event-party-rentals/page.tsx"),
  read("app/industries/page.tsx"),
 ]);
 assert.match(page,/Event & Party Rentals/);
 assert.match(page,/Inventory-aware availability/);
 assert.match(page,/Delivery and pickup planning/);
 assert.match(page,/Deposits and payment tracking/);
 assert.match(index,/\/industries\/event-party-rentals/);
});

test("event-party-rentals website landing uses the shared website-first flow",async()=>{
 const [page,config]=await Promise.all([
  read("app/event-party-rentals-website/page.tsx"),
  read("lib/websiteFirstConfig.ts"),
 ]);
 assert.match(page,/WebsiteIndustryLanding/);
 assert.match(page,/source:"event-party-rentals-website"/);
 assert.match(page,/Build My Free Website|demoPath/);
 assert.match(config,/event-party-rentals-website/);
 assert.match(config,/Bounce Houses/);
 assert.match(config,/party_rental|event and party rentals/);
});

test("event-party-rentals demo showcases rental inventory with a fictional business",async()=>{
 const demo=await read("app/demo/event-party-rentals/page.tsx");
 assert.match(demo,/BrightSky Event Rentals/);
 assert.match(demo,/fictional example website built with Servonas/i);
 assert.match(demo,/industryProfile:"party_rental"/);
 assert.match(demo,/rentalItems:\[/);
 assert.match(demo,/Build My Rental Website — Free/);
});

test("website-first migration accepts the event-party-rentals source and maps it to party rentals",async()=>{
 const sql=await read("supabase/migrations/20260821000100_add_event_party_rentals_website_first_industry.sql");
 assert.match(sql,/event-party-rentals-website/);
 assert.match(sql,/'party_rental',null/);
 assert.match(sql,/create_website_first_workspace/);
});
