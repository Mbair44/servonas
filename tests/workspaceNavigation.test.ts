import assert from "node:assert/strict";
import test from "node:test";
import {activeNavigationGroup,parseExpandedGroups,routeIsActive,visibleNavigation,workspaceNavigation} from "../lib/workspaceNavigation.ts";

test("navigation uses grouped labels without changing routes",()=>{
 const items=workspaceNavigation("acme");
 const customers=items.find(item=>item.id==="customers")!;
 const operations=items.find(item=>item.id==="operations")!;
 const workforce=items.find(item=>item.id==="workforce")!;
 const settings=visibleNavigation(items).find(item=>item.id==="settings")!;
 assert.deepEqual(customers.children?.map(item=>[item.label,item.href]),[
  ["Customers","/app/acme/customers"],
 ]);
 assert.deepEqual(operations.children?.map(item=>[item.label,item.href]),[
  ["Schedule","/app/acme/schedule"],
  ["Dispatch","/app/acme/dispatch"],
  ["Jobs","/app/acme/jobs"],
  ["Services & Pricing","/app/acme/price-book"],
  ["Invoices","/app/acme/invoices"],
 ]);
 assert.deepEqual(workforce.children?.map(item=>[item.label,item.href]),[
  ["Team","/app/acme/team"],["Field App","/tech"],
 ]);
 assert.deepEqual(settings.children?.map(item=>[item.label,item.href]),[
  ["General","/app/acme/settings"],
  ["Operations","/app/acme/settings/operations"],
  ["Billing","/app/acme/settings/billing"],
  ["Communications","/app/acme/settings/communications"],
  ["Employees","/app/acme/settings/employees"],
 ]);
 const poolSettings=visibleNavigation(workspaceNavigation("acme",{poolService:true})).find(item=>item.id==="settings")!;
 assert.equal(poolSettings.children?.at(-1)?.label,"Pool Service");
 const inventory=items.find(item=>item.id==="assets")?.children?.find(item=>item.id==="inventory");
 assert.equal(inventory?.disabled,true);
 assert.equal(inventory?.badge,"Soon");
});

test("nested routes activate their item and parent group",()=>{
 const items=workspaceNavigation("acme");
 const jobs=items.find(item=>item.id==="operations")!.children!.find(item=>item.id==="jobs")!;
 assert.equal(routeIsActive("/app/acme/jobs/123/edit",jobs),true);
 assert.equal(activeNavigationGroup("/app/acme/jobs/123/edit",items),"operations");
 assert.equal(routeIsActive("/app/acme/jobs",items[0]),false);
});

test("visibility filtering removes hidden children and empty groups",()=>{
 const filtered=visibleNavigation([
  {id:"one",label:"One",children:[{id:"hidden",label:"Hidden",href:"/hidden",visible:false}]},
  {id:"two",label:"Two",children:[{id:"shown",label:"Shown",href:"/shown"}]},
 ]);
 assert.deepEqual(filtered.map(item=>item.id),["two"]);
});

test("stored expansion parsing tolerates invalid and stale values",()=>{
 assert.deepEqual(parseExpandedGroups("not json",["sales"]),[]);
 assert.deepEqual(parseExpandedGroups('["sales","stale","sales",4]',["sales"]),["sales"]);
 assert.deepEqual(parseExpandedGroups('{"sales":true}',["sales"]),[]);
});
