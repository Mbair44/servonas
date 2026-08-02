import assert from "node:assert/strict";
import test from "node:test";
import {hasIndustryCapability} from "../lib/industryCapabilities.ts";
import {chemicalCostSpike,poolHealthAlerts,poolTrend,steadilyDecreasing} from "../lib/poolService.ts";

test("pool capabilities are isolated from other industries",()=>{
 assert.equal(hasIndustryCapability("pool_service","poolChemistryTracking"),true);
 for(const industry of ["hvac","plumbing","electrical","other"])assert.equal(hasIndustryCapability(industry,"poolChemistryTracking"),false);
});
test("pool operational alerts detect declining salt and unusual chemical cost",()=>{
 assert.equal(steadilyDecreasing([2800,3000,3200]),true);
 assert.equal(chemicalCostSpike(3000,[1000,1200,1100]),true);
});
test("pool trends and consecutive range alerts are deterministic",()=>{
 assert.equal(poolTrend(7.4,7.2),"up");
 assert.deepEqual(poolHealthAlerts([{ph:8.1},{ph:8.0},{ph:7.9}],[{field_key:"ph",minimum_value:7.2,maximum_value:7.8,consecutive_visits:3}]),[{field:"ph",direction:"high",visits:3}]);
});
