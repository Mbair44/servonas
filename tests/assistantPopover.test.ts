import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(path,import.meta.url),"utf8");

test("Assistant is opened from the authenticated ribbon instead of workspace navigation",async()=>{const layout=await read("../app/layout.tsx"),navigation=await read("../lib/workspaceNavigation.ts");assert.match(layout,/AssistantPopover/);assert.doesNotMatch(navigation,/id:"assistant"/);});
test("Assistant popover loads only the authenticated user's tenant conversation",async()=>{const route=await read("../app/api/assistant/[businessSlug]/route.ts");assert.match(route,/export async function GET/);assert.match(route,/requireWorkspace\(businessSlug\)/);assert.match(route,/\.eq\("business_id",business\.id\)/);assert.match(route,/\.eq\("user_id",user\.id\)/);});
test("old Assistant page links safely open the ribbon experience",async()=>{const page=await read("../app/app/[businessSlug]/assistant/page.tsx");assert.match(page,/redirect\(`\/app\/\$\{businessSlug\}\?assistant=open`\)/);});
test("popover supports outside click, Escape, and composer focus",async()=>{const popover=await read("../components/AssistantPopover.tsx");assert.match(popover,/pointerdown/);assert.match(popover,/event\.key==="Escape"/);assert.match(popover,/querySelector<HTMLTextAreaElement>\("textarea"\)\?\.focus/);});
