import assert from "node:assert/strict";
import test from "node:test";
import {analyzeCustomerImpact,analyzeTechnicianImpact,customerImpactCsv} from "../lib/territoryScenarioIntelligence.ts";
const territory=(id:string,zip:string)=>({id,territory_type:"postal_codes",postal_codes:[zip],neighborhoods:[],boundary_geojson:null,strategy_config:{}});
const location={id:"l",customerId:"c",customerName:"Acme contact",companyName:"Acme",tags:["VIP"],latitude:33,longitude:-111,postalCode:"85296",recurring:true,upcomingAppointments:2};
test("customer impact identifies coverage loss and priority account facts",()=>{
 const [impact]=analyzeCustomerImpact([territory("old","85296")],[],[location]);
 assert.equal(impact.change,"coverage_lost");assert.equal(impact.commercial,true);assert.equal(impact.vip,true);
 assert.match(customerImpactCsv([impact]),/Acme contact/);
});
test("technician impact derives gained and lost customers without inventing capacity",()=>{
 const impact=analyzeCustomerImpact([territory("old","85296")],[territory("new","85296")],[location]);
 const result=analyzeTechnicianImpact(impact,[{territoryId:"old",employeeId:"a",employeeName:"Alex"},{territoryId:"new",employeeId:"b",employeeName:"Blair"}]);
 assert.equal(result.find(item=>item.employeeId==="a")?.customersLost,1);
 assert.equal(result.find(item=>item.employeeId==="b")?.customersGained,1);
 assert.equal(result[0].estimatedOvertime,null);
});
