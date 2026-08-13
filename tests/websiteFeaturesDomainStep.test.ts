import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("website features use concise selectable cards",async()=>{
 const [page,styles]=await Promise.all([read("app/app/[businessSlug]/settings/website/page.tsx"),read("app/website-builder.css")]);
 assert.match(page,/Website Features/);
 assert.match(page,/Choose how customers can interact with your website/);
 assert.match(page,/Let visitors request service and create a lead inside Servonas/);
 assert.match(page,/Let customers choose a service and request an available time online/);
 assert.match(page,/Finish booking setup to enable this/);
 assert.doesNotMatch(page,/Enable Online Booking before selecting this option/);
 assert.match(styles,/website-toggle-list>label:has\(input:checked\):after/);
 assert.match(styles,/content:"✓"/);
});

test("owned domains follow save then check connection",async()=>{
 const page=await read("app/app/[businessSlug]/settings/website/page.tsx");
 assert.match(page,/connectWebsiteDomain/);
 assert.match(page,/>Save Domain</);
 assert.match(page,/>Check Connection</);
 assert.match(page,/settings\?\.custom_domain&&<button[^>]+checkWebsiteDomain/);
 assert.match(page,/Save your domain first/);
});

test("managed pilot domains do not expose DNS setup",async()=>{
 const page=await read("app/app/[businessSlug]/settings/website/page.tsx");
 assert.match(page,/requested_domain,domain_request_status/);
 assert.match(page,/managedDomainRequest=websiteFirst\?\.domain_preference==="need_domain"/);
 assert.match(page,/Domain requested — we’re confirming availability/);
 assert.match(page,/managedDomainRequest\?<><input type="hidden" name="customDomain"/);
});
