import test from "node:test";
import assert from "node:assert/strict";
import {teamActivationNeedsAttention} from "../lib/teamActivation.ts";

test("team activation attention excludes healthy and accepted counts",()=>{
 assert.equal(teamActivationNeedsAttention({total:10,active:9,withoutEmail:1,notInvited:2,pending:3,accepted:4,expired:1,failed:1,missingRoles:2}),7);
});
