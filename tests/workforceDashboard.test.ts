import assert from "node:assert/strict";
import test from "node:test";
import {formatPerformance,workforceStatus,workloadLabel} from "../lib/workforceDashboard.ts";
const base={id:"e",active:true,worksToday:true,unavailableToday:false,jobCount:2,qualificationCount:1,jobsCompleted:4,averageCompletionSeconds:3600,revenueCents:10000};
test("workforce status prioritizes time off",()=>assert.equal(workforceStatus({...base,unavailableToday:true}),"On time off"));
test("workload identifies configured capacity",()=>assert.equal(workloadLabel(4,4),"4 jobs · at capacity"));
test("performance summary uses historical facts",()=>assert.equal(formatPerformance(base),"4 completed · 60 min avg"));
test("performance does not invent missing history",()=>assert.equal(formatPerformance({...base,jobsCompleted:0}),"No completed-job history yet"));
