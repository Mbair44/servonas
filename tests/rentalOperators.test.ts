import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {billableOperatorHours,operatorCharge,operatorSelection} from "../lib/rentalOperators.ts";

const optional={operator_mode:"optional" as const,operator_hourly_rate_cents:5000,operator_default_selected:true};

test("operator hours round partial rental hours up",()=>{
 const start=new Date("2026-08-16T10:00:00Z");
 assert.equal(billableOperatorHours(start,new Date("2026-08-16T12:00:00Z")),2);
 assert.equal(billableOperatorHours(start,new Date("2026-08-16T12:01:00Z")),3);
});

test("optional operator respects the default and customer decline",()=>{
 assert.equal(operatorSelection(optional,undefined),true);
 assert.equal(operatorSelection(optional,false),false);
 assert.equal(operatorSelection({...optional,operator_default_selected:false},undefined),false);
});

test("required operator cannot be declined and the server charge is quantity-aware",()=>{
 const start=new Date("2026-08-16T10:00:00Z"),end=new Date("2026-08-16T12:15:00Z");
 const charge=operatorCharge({operator_mode:"required",operator_hourly_rate_cents:2500},start,end,2,false);
 assert.deepEqual(charge,{mode:"required",selected:true,hours:3,rateCents:2500,chargeCents:15000});
});

test("operator configuration is snapshotted and recalculated only on the server",async()=>{
 const [checkout,migration,client,email]=await Promise.all([
  readFile(new URL("../app/api/checkout/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../supabase/migrations/20260814000500_party_rental_operators.sql",import.meta.url),"utf8"),
  readFile(new URL("../components/PartyRentalBookingClient.tsx",import.meta.url),"utf8"),
  readFile(new URL("../lib/communications/rentalBookingEmailService.ts",import.meta.url),"utf8"),
 ]);
 assert.match(migration,/operator_mode text not null default 'none'/);
 assert.match(migration,/operator_charge_cents integer not null default 0/);
 assert.match(checkout,/operatorCharge\(item,startInstant,endInstant,item.quantity/);
 assert.match(checkout,/operator_mode_snapshot:item\.operator\.mode/);
 assert.match(checkout,/operator_total_cents:operatorTotalCents/);
 assert.match(client,/Professional Operator/);
 assert.match(client,/operators:selected\.map/);
 assert.match(email,/operator_billable_hours/);
});
