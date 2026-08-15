import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {describe,it} from "node:test";

const root=process.cwd();
const read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");

describe("floral website design controls",()=>{
 it("persists constrained floral typography, color, and photo layout settings",()=>{
  const migration=read("supabase/migrations/20260814000400_floral_website_design_controls.sql");
  const action=read("app/app/[businessSlug]/settings/website/actions.ts");
  assert.match(migration,/floral_font_style/);
  assert.match(migration,/floral_photo_layout/);
  assert.match(action,/floral_font_style:floralFontStyle/);
  assert.match(action,/\["elegant","romantic","modern"\]/);
 });

 it("only displays the extra editor for floral website onboarding",()=>{
  const page=read("app/app/[businessSlug]/settings/website/page.tsx");
  const fields=read("components/FloralWebsiteDesignFields.tsx");
  assert.match(page,/enabled=\{websiteFirst\?\.source==="floral-event-website"\}/);
  assert.match(fields,/if\(!enabled\)return null/);
  assert.match(fields,/name="floralFontStyle"/);
  assert.match(fields,/name="floralPhotoLayout"/);
 });

 it("applies every saved option to the public floral website",()=>{
  const loader=read("lib/businessWebsite.ts");
  const website=read("components/BusinessWebsite.tsx");
  const css=read("app/website.css");
  assert.match(loader,/floralPhotoLayout:settings\.floral_photo_layout/);
  assert.match(website,/floral-font-\$\{site\.floralFontStyle\}/);
  assert.match(website,/site\.floralPhotoLayout==="gallery_first"/);
  assert.match(css,/\.website-floral-event\.floral-photos-hero_full/);
 });
});
