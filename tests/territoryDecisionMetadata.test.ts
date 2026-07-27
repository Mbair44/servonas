import assert from "node:assert/strict";
import test from "node:test";
import {validateTerritoryDecisionMetadata,type TerritoryDecisionMetadata} from "../lib/territoryDecisionMetadata.ts";
const valid:TerritoryDecisionMetadata={source:"business_rules",sourceVersion:"territory-rules-v1",recommendationKey:"beneficial",scenarioVersion:2,simulationRevision:3,score:82,categoryScores:{drive:{weight:30,score:80}},inputSnapshot:{customerCount:10},explanation:{summary:["one change"],reasons:["less driving"]},outcome:"pending"};
test("future decision metadata remains provider-neutral and revision bound",()=>assert.equal(validateTerritoryDecisionMetadata(valid),null));
test("decision metadata rejects invalid revisions and scores",()=>{
 assert.match(validateTerritoryDecisionMetadata({...valid,scenarioVersion:0})??"",/revision/i);
 assert.match(validateTerritoryDecisionMetadata({...valid,score:101})??"",/score/i);
});
