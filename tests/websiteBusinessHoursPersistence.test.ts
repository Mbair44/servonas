import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("website hours start with defaults but persist all seven edited day states",async()=>{
 const [editor,fields,actions,page]=await Promise.all([
  read("components/BusinessHoursEditor.tsx"),
  read("components/WebsiteHoursAreasFields.tsx"),
  read("app/app/[businessSlug]/settings/website/actions.ts"),
  read("app/app/[businessSlug]/settings/website/page.tsx"),
 ]);
 assert.match(editor,/defaultBusinessHoursValues\(\)/);
 assert.match(fields,/open:Boolean\(row\?\.active\)/);
 assert.match(actions,/for\(let weekday=0;weekday<7;weekday\+\+\)/);
 assert.match(actions,/active:data\.get|const active=data\.get/);
 assert.match(actions,/\.insert\(availability\)/);
 assert.match(page,/select\("weekday,start_time,end_time,active"\)/);
 assert.match(page,/filter\(hour=>hour\.active\)/);
});

test("closed website days remain unavailable to public booking",async()=>{
 const availability=await read("lib/publicAvailability.ts");
 assert.match(availability,/\.eq\("active", true\)/);
});
