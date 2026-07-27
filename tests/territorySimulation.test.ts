import assert from "node:assert/strict";
import test from "node:test";
import {simulateTerritories} from "../lib/territorySimulation.ts";
const territory=(id:string,postal:string)=>({id,territory_type:"postal_codes",postal_codes:[postal],neighborhoods:[],boundary_geojson:null,strategy_config:{}});
const location={id:"l1",customerId:"c1",latitude:33,longitude:-111,postalCode:"85296",recurringRevenueCents:12000,jobsPerWeek:2,weeklyDriveMeters:1609,weeklyDriveSeconds:600};
test("scenario simulation identifies changed coverage and preserves measured units",()=>{
 const result=simulateTerritories([territory("old","85296")],[territory("new","85296")],[location]);
 assert.equal(result.customersAffected,1);
 assert.equal(result.coverageGaps,0);
 assert.equal(result.weeklyDriveMeters,1609);
 assert.equal(result.weeklyDriveSeconds,600);
 assert.equal(result.recurringRevenueCents,12000);
});
test("scenario simulation reports gaps without inventing unsupported estimates",()=>{
 const result=simulateTerritories([territory("old","85296")],[],[location]);
 assert.equal(result.coverageGaps,1);
 assert.equal(result.customerCount,0);
 assert.equal(result.technicianUtilization,null);
 assert.equal(result.estimatedFuelUsage,null);
});
