import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
test("promotion pages use the tenant shell and responsive product grid",async()=>{const [middleware,layout,landing,styles]=await Promise.all([read("middleware.ts"),read("app/layout.tsx"),read("components/PromotionLanding.tsx"),read("app/globals.css")]);assert.match(middleware,/bareShellHeaders\.set\("x-servonas-public-shell","bare"\)/);assert.match(layout,/!barePublicShell&&<footer/);assert.match(landing,/href="#eligible-rentals"/);assert.doesNotMatch(landing,/promotion-primary-cta/);assert.match(landing,/promotion-rental-grid/);assert.match(styles,/\.promotion-rental-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);assert.match(styles,/\.promotion-rental-image img\{[^}]*object-fit:contain/);});
