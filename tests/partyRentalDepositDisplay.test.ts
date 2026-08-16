import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

test("a full rental deposit is displayed as the total due now",async()=>{const source=await readFile(new URL("../components/PartyRentalBookingClient.tsx",import.meta.url),"utf8");assert.match(source,/safeDepositPercent===100\?"Total due now":"Total"/);assert.match(source,/safeDepositPercent<100/);assert.doesNotMatch(source,/100% deposit due now/);});

test("blocked rental days show an availability tooltip and react to selected items",async()=>{const source=await readFile(new URL("../components/PartyRentalBookingClient.tsx",import.meta.url),"utf8");assert.match(source,/const blockedDateSet=useMemo\(\(\)=>\{const next=new Set\(blockedDates\);for\(const item of selected\)/);assert.match(source,/itemUnavailable/);assert.match(source,/title=\{unavailable\?/);});
