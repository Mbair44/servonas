import assert from "node:assert/strict";
import test from "node:test";
import {rentalEmailDeliveryIsLive} from "../lib/emailDeliveryMode.ts";

test("rental email delivery sends in explicit live mode",()=>{
 assert.equal(rentalEmailDeliveryIsLive("live","development"),true);
});

test("rental email delivery defaults to live in production when mode is omitted",()=>{
 assert.equal(rentalEmailDeliveryIsLive(undefined,"production"),true);
});

test("rental email delivery honors explicit stub mode",()=>{
 assert.equal(rentalEmailDeliveryIsLive("stub","production"),false);
 assert.equal(rentalEmailDeliveryIsLive(undefined,"development"),false);
});
