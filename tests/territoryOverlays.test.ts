import assert from "node:assert/strict";
import test from "node:test";
import {decodeEncodedPolyline,validOverlayPoint} from "../lib/territoryOverlays.ts";

test("territory overlays accept only usable WGS84 coordinates",()=>{
 assert.equal(validOverlayPoint(33.35,-111.79),true);
 assert.equal(validOverlayPoint(0,0),false);
 assert.equal(validOverlayPoint(91,-111),false);
});
test("territory route overlays decode provider polylines locally",()=>{
 assert.deepEqual(decodeEncodedPolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"),[
  {lat:38.5,lng:-120.2},{lat:40.7,lng:-120.95},{lat:43.252,lng:-126.453},
 ]);
});
