import assert from "node:assert/strict";
import test from "node:test";
import {parseGoogleBusinessRating,selectGoogleBusinessCandidate} from "../lib/googleBusinessPlace.ts";

test("selects an exact normalized Google business name",()=>{
 const place=selectGoogleBusinessCandidate([{id:"wrong",displayName:{text:"Other"}},{id:"right",displayName:{text:"Copper State Bounce!"}}],"Copper State Bounce");
 assert.equal(place?.id,"right");
});

test("does not guess when Google returns multiple nonmatching businesses",()=>{
 assert.equal(selectGoogleBusinessCandidate([{id:"one",displayName:{text:"One"}},{id:"two",displayName:{text:"Two"}}],"Wanted"),null);
});

test("parses authoritative Google rating fields",()=>{
 assert.deepEqual(parseGoogleBusinessRating({rating:5,userRatingCount:2,googleMapsUri:"https://maps.google.com/example"}),{rating:5,reviewCount:2,googleMapsUri:"https://maps.google.com/example"});
 assert.equal(parseGoogleBusinessRating({rating:6,userRatingCount:2}),null);
});
