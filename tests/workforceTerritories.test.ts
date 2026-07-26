import assert from "node:assert/strict";
import test from "node:test";
import {splitTerritoryValues,validateTerritory} from "../lib/workforceTerritories.ts";

const valid={name:"East Valley",type:"mixed",postalCodes:["85234"],neighborhoods:["Downtown"],boundary:"",color:"#4F46E5",description:"",notes:""};
test("territory domain accepts progressive optional setup",()=>assert.equal(validateTerritory(valid),null));
test("territory domain rejects unsafe colors",()=>assert.match(validateTerritory({...valid,color:"blue"})!,/color/i));
test("territory domain normalizes ZIP and neighborhood lists",()=>assert.deepEqual(splitTerritoryValues("85234, 85296\n85234"),["85234","85296"]));
test("territory domain validates polygon geometry type",()=>assert.match(validateTerritory({...valid,boundary:'{\"type\":\"Point\",\"coordinates\":[1,2]}'})!,/Polygon/i));
