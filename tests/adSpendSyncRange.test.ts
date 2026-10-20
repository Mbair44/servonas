import assert from "node:assert/strict";
import test from "node:test";
import {adSpendSyncRange} from "../lib/adSpendSyncRange.ts";
test("bounded backfill accepts inclusive two-week ranges",()=>assert.deepEqual(adSpendSyncRange({dateFrom:"2026-10-01",dateThrough:"2026-10-12",fallbackDays:7,today:new Date("2026-10-20T12:00:00Z")}),{from:"2026-10-01",to:"2026-10-12"}));
test("backfill rejects future, partial, and excessive ranges",()=>{for(const range of [{dateFrom:"2026-10-01",dateThrough:"2026-10-20"},{dateFrom:"2026-10-01"},{dateFrom:"2026-10-21",dateThrough:"2026-10-21"}])assert.throws(()=>adSpendSyncRange({...range,fallbackDays:7,today:new Date("2026-10-20T12:00:00Z")}));});
