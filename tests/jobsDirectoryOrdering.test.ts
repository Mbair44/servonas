import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("the Jobs directory keeps completed jobs below active jobs before applying the chosen sort",()=>{
 const page=readFileSync(new URL("../app/app/[businessSlug]/jobs/page.tsx",import.meta.url),"utf8");
 const completed=page.indexOf('const completedComparison=Number(left.status==="completed")-Number(right.status==="completed");');
 const sortValue=page.indexOf("const value=(job:typeof left):string|number=>{");
 assert.ok(completed>=0&&completed<sortValue);
 assert.match(page,/if\(completedComparison\)return completedComparison;/);
});
