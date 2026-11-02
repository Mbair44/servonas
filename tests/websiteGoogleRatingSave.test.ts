import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("saving website edits preserves an existing Google rating connection",async()=>{
 const source=await readFile(new URL("../app/app/[businessSlug]/settings/website/actions.ts",import.meta.url),"utf8");
 assert.match(source,/requestedGooglePlaceId!==existing\?\.google_place_id/);
 assert.match(source,/google_place_id:googlePlace\?\.ok\?googlePlace\.placeId:existing\?\.google_place_id\?\?null/);
 assert.doesNotMatch(source,/Google rating was disconnected/);
});
