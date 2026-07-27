import assert from "node:assert/strict";
import test from "node:test";
import {territoryContainsLocation,type TerritoryStatisticDefinition} from "../lib/territoryStatistics.ts";
const base:TerritoryStatisticDefinition={id:"territory",territory_type:"mixed",postal_codes:[],neighborhoods:[],boundary_geojson:null,strategy_config:{}};
test("territory statistics match postal, city, and neighborhood strategies",()=>{
 const location={latitude:33.35,longitude:-111.79,postalCode:"85296",city:"Gilbert",neighborhood:"Agritopia"};
 assert.equal(territoryContainsLocation({...base,postal_codes:["85296"]},location),true);
 assert.equal(territoryContainsLocation({...base,strategy_config:{cities:["gilbert"]}},location),true);
 assert.equal(territoryContainsLocation({...base,neighborhoods:["AGRITOPIA"]},location),true);
});
test("territory statistics match radius and polygon boundaries",()=>{
 assert.equal(territoryContainsLocation({...base,strategy_config:{center:{latitude:33.35,longitude:-111.79},radius_meters:2000}},{latitude:33.36,longitude:-111.79}),true);
 assert.equal(territoryContainsLocation({...base,boundary_geojson:{type:"Polygon",coordinates:[[[-112,33],[-111,33],[-111,34],[-112,34],[-112,33]]]}},{latitude:33.5,longitude:-111.5}),true);
});
