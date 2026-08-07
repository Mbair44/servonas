import assert from "node:assert/strict";
import test from "node:test";
import {parseGoogleBusinessRating,selectGoogleBusinessCandidate} from "../lib/googleBusinessPlace.ts";

test("selects an exact normalized Google business name at the configured address",()=>{
 const place=selectGoogleBusinessCandidate([{id:"wrong",displayName:{text:"Copper State Bounce!"},formattedAddress:"10 Main St, Dallas, TX 75001"},{id:"right",displayName:{text:"Copper State Bounce!"},formattedAddress:"44 Park Ave, Phoenix, AZ 85001"}],"Copper State Bounce","44 Park Avenue, Phoenix, AZ 85001");
 assert.equal(place?.id,"right");
});

test("does not guess when Google returns a same-name business at another address",()=>{
 assert.equal(selectGoogleBusinessCandidate([{id:"wrong",displayName:{text:"Copper State Bounce"},formattedAddress:"10 Main St, Dallas, TX 75001"}],"Copper State Bounce","44 Park Ave, Phoenix, AZ 85001"),null);
});

test("parses authoritative Google rating fields",()=>{
 assert.deepEqual(parseGoogleBusinessRating({rating:5,userRatingCount:2,googleMapsUri:"https://maps.google.com/example"}),{rating:5,reviewCount:2,googleMapsUri:"https://maps.google.com/example"});
 assert.equal(parseGoogleBusinessRating({rating:6,userRatingCount:2}),null);
});
