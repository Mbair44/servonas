import assert from "node:assert/strict";
import test from "node:test";
import {summarizeScenario,validateScenarioDetails} from "../lib/territoryScenarios.ts";
test("scenario details require bounded human-readable content",()=>{
 assert.equal(validateScenarioDetails("East Valley balance","Move two areas"),null);
 assert.match(validateScenarioDetails("","")!,/name/i);
 assert.match(validateScenarioDetails("Valid","x".repeat(2001))!,/2,000/i);
});
test("scenario comparison keeps removed territories out of proposed totals",()=>{
 assert.deepEqual(summarizeScenario(3,[{change_type:"unchanged"},{change_type:"modified"},{change_type:"removed"},{change_type:"created"}]),{liveCount:3,proposedCount:3,changedCount:3});
});
