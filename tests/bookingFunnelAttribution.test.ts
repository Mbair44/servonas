import assert from "node:assert/strict";
import test from "node:test";
import {attributionFromSearch,validSessionId} from "../lib/bookingFunnel.ts";

test("captures Google click IDs and UTMs without retaining unrelated query values",()=>{
 const values=attributionFromSearch(new URLSearchParams("gclid=click-1&utm_source=google&utm_medium=cpc&utm_campaign=summer&email=private@example.com"));
 assert.deepEqual(values,{gclid:"click-1",utm_source:"google",utm_medium:"cpc",utm_campaign:"summer"});
});
test("accepts only UUID anonymous attribution session identifiers",()=>{
 assert.equal(validSessionId("9c95b508-72a0-4e01-9c24-2a86bf1f4eb3"),true);
 assert.equal(validSessionId("other-business-session"),false);
});
