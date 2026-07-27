import assert from "node:assert/strict";
import test from "node:test";
import {analyzeCustomerImpact,analyzeFinancialImpact,analyzeTechnicianImpact,customerImpactCsv,explainScenario,scoreScenario} from "../lib/territoryScenarioIntelligence.ts";
const territory=(id:string,zip:string)=>({id,territory_type:"postal_codes",postal_codes:[zip],neighborhoods:[],boundary_geojson:null,strategy_config:{}});
const location={id:"l",customerId:"c",customerName:"Acme contact",companyName:"Acme",tags:["VIP"],latitude:33,longitude:-111,postalCode:"85296",recurring:true,upcomingAppointments:2};
test("customer impact identifies coverage loss and priority account facts",()=>{
 const [impact]=analyzeCustomerImpact([territory("old","85296")],[],[location]);
 assert.equal(impact.change,"coverage_lost");assert.equal(impact.commercial,true);assert.equal(impact.vip,true);
 assert.match(customerImpactCsv([impact]),/Acme contact/);
});
test("optimization score exposes weights and excludes unavailable categories",()=>{
 const result=scoreScenario({currentDriveSeconds:100,proposedDriveSeconds:80,affectedCustomers:1,totalCustomers:10,coverageGaps:0,currentDensity:2,proposedDensity:3});
 assert.equal(result.categories.find(item=>item.key==="balance")?.score,null);
 assert.equal(result.scoredWeight,75);assert.ok((result.score??0)>0);
});
test("decision rules never recommend a scenario with coverage loss",()=>{
 const customerImpact=analyzeCustomerImpact([territory("old","85296")],[],[location]);
 const financial=analyzeFinancialImpact({recurringRevenueCents:100,weeklyDriveMeters:1000,weeklyDriveSeconds:100},{recurringRevenueCents:0,weeklyDriveMeters:0,weeklyDriveSeconds:0});
 const decision=explainScenario({changedTerritories:1,customerImpact,financial});
 assert.equal(decision.recommendation,"needs_attention");assert.match(decision.recommendationText,/coverage/i);
});
test("financial impact labels only measured differences",()=>{
 const result=analyzeFinancialImpact({recurringRevenueCents:100,weeklyDriveMeters:1000,weeklyDriveSeconds:60},{recurringRevenueCents:150,weeklyDriveMeters:800,weeklyDriveSeconds:50});
 assert.equal(result.recurringRevenueCoveredDifferenceCents,50);assert.equal(result.weeklyDriveMetersDifference,-200);
 assert.equal(result.fuelSavingsCents,null);assert.equal(result.laborSavingsCents,null);
});
test("technician impact derives gained and lost customers without inventing capacity",()=>{
 const impact=analyzeCustomerImpact([territory("old","85296")],[territory("new","85296")],[location]);
 const result=analyzeTechnicianImpact(impact,[{territoryId:"old",employeeId:"a",employeeName:"Alex"},{territoryId:"new",employeeId:"b",employeeName:"Blair"}]);
 assert.equal(result.find(item=>item.employeeId==="a")?.customersLost,1);
 assert.equal(result.find(item=>item.employeeId==="b")?.customersGained,1);
 assert.equal(result[0].estimatedOvertime,null);
});
