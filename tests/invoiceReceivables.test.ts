import test from "node:test";
import assert from "node:assert/strict";
import type {SupabaseClient} from "@supabase/supabase-js";
import {isOutstandingInvoice,isOverdueInvoice,loadOverdueInvoiceSummary} from "../lib/financial/invoiceReceivables.ts";
test("voided invoices behind the $154.65 warning are not outstanding or overdue",()=>{
 for(const balance of [7500,7965]){const row={status:"void",balance_due_cents:balance,due_date:"2026-10-06"};assert.equal(isOutstandingInvoice(row),false);assert.equal(isOverdueInvoice(row,"2026-10-11"),false);}
});
test("only collectible positive balances past their due date are overdue",()=>{
 const row={status:"sent",balance_due_cents:500,due_date:"2026-10-10"};
 for(const status of ["draft","paid","void","uncollectible","refunded","unknown"])assert.equal(isOverdueInvoice({...row,status},"2026-10-11"),false);
 for(const status of ["sent","viewed","partially_paid","overdue"])assert.equal(isOverdueInvoice({...row,status},"2026-10-11"),true);
 for(const change of [{balance_due_cents:0},{balance_due_cents:-1},{due_date:null},{due_date:"2026-10-11"},{due_date:"2026-10-12"},{is_deleted:true}])assert.equal(isOverdueInvoice({...row,...change},"2026-10-11"),false);
 // The caller passes the business-local date, not tomorrow's UTC date.
 assert.equal(isOverdueInvoice({...row,due_date:"2026-10-11"},"2026-10-11"),false);
});
test("summary is tenant scoped, excludes noncollectible records and reads beyond one page",async()=>{
 const rows=[...Array.from({length:501},(_,id)=>({id,business_id:"a",status:"sent",is_deleted:false,balance_due_cents:100,due_date:"2026-10-01"})),{id:502,business_id:"b",status:"overdue",is_deleted:false,balance_due_cents:5000,due_date:"2026-10-01"},{id:503,business_id:"a",status:"void",is_deleted:false,balance_due_cents:15465,due_date:"2026-10-01"}];let requests=0;
 const db={from(table:string){assert.equal(table,"invoices");let filtered=rows;const query={select(){return query;},eq(key:string,value:unknown){filtered=filtered.filter(r=>r[key as keyof typeof r]===value);return query;},in(key:string,values:unknown[]){filtered=filtered.filter(r=>values.includes(r[key as keyof typeof r]));return query;},gt(key:string,value:number){filtered=filtered.filter(r=>Number(r[key as keyof typeof r])>value);return query;},lt(key:string,value:string){filtered=filtered.filter(r=>String(r[key as keyof typeof r])<value);return query;},order(){return query;},async range(start:number,end:number){requests++;return {data:filtered.slice(start,end+1),error:null};}};return query;}} as unknown as SupabaseClient;
 assert.deepEqual(await loadOverdueInvoiceSummary(db,"a","2026-10-11"),{overdueCount:501,overdueAmountCents:50100});assert.equal(requests,2);
});
