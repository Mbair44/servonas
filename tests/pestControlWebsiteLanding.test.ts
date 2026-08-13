import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=()=>readFile(new URL("../app/pest-control-website/page.tsx",import.meta.url),"utf8");

test("pest-control website landing page leads with the free website pilot",async()=>{const code=await source();assert.match(code,/We&apos;ll Build Your Pest Control Website/);assert.match(code,/Build My Free Website/);assert.match(code,/limited number of pest control companies/);assert.match(code,/More than a website/);});
test("landing metadata matches pest-control website search intent",async()=>{const code=await source();assert.match(code,/Free Pest Control Website \| Servonas/);assert.match(code,/pest control website design/);assert.match(code,/pest control website builder/);});
test("signup CTAs preserve supported marketing attribution",async()=>{const code=await source();for(const key of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","gbraid","wbraid"])assert.match(code,new RegExp(`\\"${key}\\"`));assert.match(code,/href=\{signup\}/);});
test("landing page links to the public example site and preserves attribution",async()=>{const code=await source();assert.match(code,/View Example Website/);assert.match(code,/demoHref/);assert.match(code,/href=\{demo\}/);});
test("page reuses centralized analytics and does not inject another Google tag",async()=>{const code=await source();assert.doesNotMatch(code,/googletagmanager|gtag\s*\(/);});
test("custom-domain FAQ only describes supported DNS verification behavior",async()=>{const code=await source();assert.match(code,/supports connecting a domain you already own/);assert.match(code,/required DNS records/);assert.match(code,/automatic HTTPS after verification/);});
