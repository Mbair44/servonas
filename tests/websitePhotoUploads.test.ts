import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("website photos use signed direct uploads instead of the website settings request body",async()=>{
 const [manager,actions]=await Promise.all([read("components/WebsitePhotoManager.tsx"),read("app/app/[businessSlug]/settings/website/actions.ts")]);
 assert.match(manager,/uploadToSignedUrl/);
 assert.match(manager,/prepareWebsitePhotoUpload/);
 assert.doesNotMatch(manager,/name="websitePhotos"/);
 assert.match(actions,/createSignedUploadUrl/);
 assert.match(actions,/requireWorkspaceCapability\(slug,"business_onboarding"\)/);
});

test("mobile website photos are optimized and failures are shown inline",async()=>{
 const manager=await read("components/WebsitePhotoManager.tsx");
 assert.match(manager,/image\/heic/);
 assert.match(manager,/image\/heif/);
 assert.match(manager,/canvas\.toBlob\(resolve,"image\/jpeg"/);
 assert.match(manager,/role="alert"/);
 assert.match(manager,/items\.length\+selected\.length>12/);
});

test("large website photo sets stay contained in the design editor",async()=>{
 const styles=await read("app/website-builder.css");
 assert.match(styles,/\.website-step-design \.website-photo-previews\{grid-template-columns:repeat\(auto-fill,minmax\(112px,1fr\)\);max-height:390px;overflow-y:auto/);
 assert.match(styles,/@container\(max-width:700px\)[\s\S]*\.website-step-design \.website-template-grid\{grid-template-columns:1fr\}/);
 assert.match(styles,/@container\(max-width:430px\)[\s\S]*\.website-step-design \.website-photo-previews\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
