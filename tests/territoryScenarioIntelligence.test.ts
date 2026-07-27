import assert from "node:assert/strict";
import test from "node:test";
import {analyzeCustomerImpact,customerImpactCsv} from "../lib/territoryScenarioIntelligence.ts";
const territory=(id:string,zip:string)=>({id,territory_type:"postal_codes",postal_codes:[zip],neighborhoods:[],boundary_geojson:null,strategy_config:{}});
const location={id:"l",customerId:"c",customerName:"Acme contact",companyName:"Acme",tags:["VIP"],latitude:33,longitude:-111,postalCode:"85296",recurring:true,upcomingAppointments:2};
test("customer impact identifies coverage loss and priority account facts",()=>{
 const [impact]=analyzeCustomerImpact([territory("old","85296")],[],[location]);
 assert.equal(impact.change,"coverage_lost");assert.equal(impact.commercial,true);assert.equal(impact.vip,true);
 assert.match(customerImpactCsv([impact]),/Acme contact/);
});
