import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {mechanicalBullOperatorCopy} from "../lib/mechanicalBullLanding.ts";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const item={id:"item-1",name:"Mechanical Bull",description:null,imageUrl:null,dailyPriceCents:25000,standardRentalHours:24,multiDayMessage:null,operatorMode:"optional" as const,operatorHourlyRateCents:5000,operatorDefaultSelected:true};

test("mechanical bull copy reflects the configured operator mode instead of claiming inclusion",()=>{
 assert.match(mechanicalBullOperatorCopy(item),/selected by default/);
 assert.match(mechanicalBullOperatorCopy({...item,operatorMode:"required"}),/required/);
 assert.match(mechanicalBullOperatorCopy({...item,operatorMode:"none"}),/current booking configuration/);
});

test("mechanical-bull landing uses live inventory, existing booking, and date availability",async()=>{
 const [loader,page,component,booking,middleware]=await Promise.all([read("lib/mechanicalBullLanding.ts"),read("app/mechanical-bull-rental/page.tsx"),read("components/MechanicalBullLanding.tsx"),read("app/book/[businessSlug]/page.tsx"),read("middleware.ts")]);
 assert.match(loader,/ilike\("name","%mechanical%bull%"\)/);
 assert.match(loader,/daily_price_cents/);
 assert.match(loader,/operator_mode/);
 assert.match(page,/embed:"1",item:itemId/);
 assert.match(component,/mechanical_bull_check_availability/);
 assert.match(booking,/initialItemId/);
 assert.match(middleware,/path==="\/mechanical-bull-rental"/);
});
