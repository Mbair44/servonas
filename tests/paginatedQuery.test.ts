import assert from "node:assert/strict";
import test from "node:test";
import {loadAllPages} from "../lib/paginatedQuery.ts";

test("loads every PostgREST page instead of silently stopping at 1,000 rows",async()=>{
 const rows=Array.from({length:2_401},(_,id)=>id);
 const result=await loadAllPages(async(from,to)=>({data:rows.slice(from,to+1),error:null}));
 assert.equal(result.error,null);
 assert.equal(result.data?.length,2_401);
 assert.deepEqual(result.data?.slice(-2),[2_399,2_400]);
});

test("returns a query error without reporting a partial analytics result",async()=>{
 const error=new Error("database unavailable");
 const result=await loadAllPages(async(from)=>from===0?{data:Array.from({length:1_000},(_,id)=>id),error:null}:{data:null,error});
 assert.equal(result.data,null);
 assert.equal(result.error,error);
});
