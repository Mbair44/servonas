import assert from "node:assert/strict";
import test from "node:test";
import {bookingManageTokenHash} from "../lib/bookingManage/tokenHash.ts";
import {existingManageBookingUrl} from "../lib/bookingManage/existingManageBookingUrl.ts";

const token="abcdefghijklmnopqrstuvwxyzABCDEF0123456789_-";

test("reopens only a previously sent active Manage Booking token",()=>{
 const url=existingManageBookingUrl({tokenHash:bookingManageTokenHash(token),expiresAt:null,messageBodies:[`Booking link: https://old.example/manage-booking/${token}`],origin:"https://servonas.com"});
 assert.equal(url,`https://servonas.com/manage-booking/${token}`);
});

test("does not expose a stale, wrong, or expired Manage Booking token",()=>{
 assert.equal(existingManageBookingUrl({tokenHash:bookingManageTokenHash(token),expiresAt:null,messageBodies:["https://servonas.com/manage-booking/not-the-same-token-01234567890123456789"],origin:"https://servonas.com"}),null);
 assert.equal(existingManageBookingUrl({tokenHash:bookingManageTokenHash(token),expiresAt:"2026-01-01T00:00:00Z",messageBodies:[`https://servonas.com/manage-booking/${token}`],origin:"https://servonas.com",now:new Date("2026-10-07T00:00:00Z")}),null);
});
