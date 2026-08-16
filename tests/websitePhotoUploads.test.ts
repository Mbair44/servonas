import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("website photos use signed direct uploads instead of the website settings request body",async()=>{
 const [manager,actions]=await Promise.all([read("components/WebsitePhotoManager.tsx"),read("app/app/[businessSlug]/settings/website/actions.ts")]);
 assert.match(manager,/uploadToSignedUrl/);
 assert.match(manager,/prepareWebsitePhotoUpload/);
 assert.doesNotMatch(manager,/name="websitePhotos"/);
 assert.match(manager,/Media Library/);
 assert.match(manager,/Select all/);
 assert.match(actions,/createSignedUploadUrl/);
 assert.match(actions,/requireWorkspaceCapability\(slug,"business_onboarding"\)/);
});

test("mobile website photos are optimized and failures are shown inline",async()=>{
 const manager=await read("components/WebsitePhotoManager.tsx");
 assert.match(manager,/image\/heic/);
 assert.match(manager,/image\/heif/);
 assert.match(manager,/canvas\.toBlob\(resolve,"image\/jpeg"/);
 assert.match(manager,/role="alert"/);
 assert.match(manager,/Uploading \$\{uploadStates\.filter/);
});

test("large website photo sets stay contained in the design editor",async()=>{
 const [builder,styles]=await Promise.all([read("app/website-builder.css"),read("app/website.css")]);
 assert.match(builder,/\.website-step-design \.website-photo-manager\{min-width:0;max-width:100%\}/);
 assert.match(styles,/\.website-photo-library\{width:min\(1200px,100%\);max-height:min\(92vh,920px\)/);
 assert.match(builder,/\.website-step-design \.website-template-grid\{grid-template-columns:1fr\}/);
 assert.match(styles,/@media\(max-width:720px\)[\s\S]*\.website-photo-hero-grid,\.(?:website-photo-grid)\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
