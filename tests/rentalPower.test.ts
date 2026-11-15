import assert from "node:assert/strict";
import test from "node:test";
import {outletLabel,powerReminder,rentalPowerRequirement} from "../lib/rentalPower.ts";

test("rental power requirements multiply configured outlets by quantity",()=>{
 const items=[{id:"one",name:"Castle",power_outlets_required:1},{id:"two",name:"Course",power_outlets_required:2},{id:"zero",name:"Table",power_outlets_required:0}];
 assert.deepEqual(rentalPowerRequirement(items,[{inventoryItemId:"one",quantity:1}]),{totalOutlets:1,hasUnconfiguredItems:false,instructions:[]});
 assert.equal(rentalPowerRequirement(items,[{inventoryItemId:"one",quantity:1},{inventoryItemId:"two",quantity:1},{inventoryItemId:"zero",quantity:4}]).totalOutlets,3);
 assert.equal(rentalPowerRequirement(items,[{inventoryItemId:"two",quantity:2}]).totalOutlets,4);
});

test("legacy null power configuration is never mistaken for zero",()=>{
 const requirement=rentalPowerRequirement([{id:"legacy",power_outlets_required:null}],[{inventoryItemId:"legacy",quantity:1}]);
 assert.equal(requirement.hasUnconfiguredItems,true);
 assert.match(powerReminder(requirement,"unsure"),/power review/i);
});

test("power copy handles singular, plural, and generator-confirmed suppression inputs",()=>{
 assert.equal(outletLabel(1),"1 electrical outlet");
 assert.equal(outletLabel(3),"3 electrical outlets");
 assert.match(powerReminder({totalOutlets:3,hasUnconfiguredItems:false},"unsure"),/weren't sure/i);
 assert.match(powerReminder({totalOutlets:1,hasUnconfiguredItems:false},"electricity"),/1 electrical outlet/);
});
