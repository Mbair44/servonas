import assert from "node:assert/strict";
import test from "node:test";
import {splitTerritoryValues,validateTerritory} from "../lib/workforceTerritories.ts";

const valid={name:"East Valley",type:"mixed",postalCodes:["85234"],neighborhoods:["Downtown"],boundary:"",color:"#4F46E5",description:"",notes:""};
test("territory domain accepts progressive optional setup",()=>assert.equal(validateTerritory(valid),null));
test("territory domain rejects unsafe colors",()=>assert.match(validateTerritory({...valid,color:"blue"})!,/color/i));
test("territory domain normalizes ZIP and neighborhood lists",()=>assert.deepEqual(splitTerritoryValues("85234, 85296\n85234"),["85234","85296"]));
test("territory domain validates polygon geometry type",()=>assert.match(validateTerritory({...valid,boundary:'{\"type\":\"Point\",\"coordinates\":[1,2]}'})!,/Polygon/i));
test("territory domain supports every operating strategy",()=>{
 for(const type of ["postal_codes","neighborhoods","polygon","city_boundaries","delivery_zone","service_area","mixed"]){
  assert.equal(validateTerritory({...valid,type}),null);
 }
 assert.equal(validateTerritory({...valid,type:"radius",strategyConfig:{center:{latitude:33.35,longitude:-111.79},radius_meters:16093}}),null);
});
test("radius territories require valid WGS84 center and meter distance",()=>{
 assert.match(validateTerritory({...valid,type:"radius",strategyConfig:{center:{latitude:133,longitude:-111.79},radius_meters:16093}})!,/latitude/i);
 assert.match(validateTerritory({...valid,type:"radius",strategyConfig:{center:{latitude:33.35,longitude:-111.79},radius_meters:0}})!,/Radius/i);
});
