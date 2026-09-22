import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const booking=read("components/PartyRentalBookingClient.tsx");
const tracker=read("components/TenantBookingFunnelTracker.tsx");
const route=read("app/api/public-booking/[businessSlug]/funnel/route.ts");
const page=read("app/app/[businessSlug]/marketing/funnel/page.tsx");
const compile=(source:string)=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
function declaration(source:string,name:string){
 const ast=ts.createSourceFile("test.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let found="";
 function visit(node:ts.Node){
  if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node.getText(ast);
  if(ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)===name))found=node.getText(ast);
  ts.forEachChild(node,visit);
 }
 visit(ast);assert.ok(found,name);return found;
}
function harness(){
 const requests:any[]=[];
 const storage=new Map<string,string>();
 const sessionStorage=new Map<string,string>();
 const noop=()=>{};
 const context=vm.createContext({exports:{},crypto,Set,Map,Date,URLSearchParams,Element:class {},window:{navigator:{userAgent:""},sessionStorage:{getItem:(k:string)=>sessionStorage.get(k)??null,setItem:(k:string,v:string)=>sessionStorage.set(k,v)},localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)}},location:{pathname:"/book/test",search:"",href:"https://test/book/test"},document:{referrer:""},navigator:{userAgent:""},localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)},publicBookingFunnelEnabled:()=>true,attributionFromSearch:()=>({}),fetch:(_url:string,options:any)=>{requests.push(JSON.parse(options.body));return Promise.resolve({ok:true,status:204});},businessSlug:"test",date:"2026-09-20",focusedItemId:null,availabilityItemId:null,flowSource:"date_first",initialPromotionCode:null,setAvailabilityItemId:noop,setFocusedItemId:noop,setFlowSource:noop,setDate:noop,setEndDate:noop,setCartConflictMessage:noop,hoursForDate:()=>null,setStartTime:noop,setEndTime:noop,trackMetaStandardEvent:noop});
 const trackerCore=tracker.slice(0,tracker.indexOf("type TenantBookingFunnelTrackerProps")).replace(/^import .*;\n/gm,"");
 vm.runInContext(compile(trackerCore),context);
 vm.runInContext(compile(["clean","safeMetadata","eventKeyFor"].map(name=>declaration(route,name)).join("\n")+ '\nconst validSessionId=(value:unknown)=>typeof value==="string"&&/^[0-9a-f-]{36}$/i.test(value);'),context);
 vm.runInContext(compile(["applyDate","noteInventoryInteraction"].map(name=>declaration(booking,name)).join("\n")),context);
 return {context,requests};
}
test("a fresh promotion tab captures Meta attribution without inheriting an old direct local-storage session",()=>{
 const {context}=harness();
 const legacy=JSON.stringify({sessionId:crypto.randomUUID(),attribution:{},landingUrl:"https://test/fall-party-special",referrer:""});
 vm.runInContext(`localStorage.setItem("servonas.booking-attribution.test",${JSON.stringify(legacy)})`,context);
 vm.runInContext('location.pathname="/fall-party-special";location.search="?utm_source=facebook&utm_medium=paid_social&utm_campaign=fall_party_special&utm_content=pumpkin_static&utm_term=ad_set&fbclid=meta-click";location.href="https://test/fall-party-special"+location.search;attributionFromSearch=params=>Object.fromEntries(["utm_source","utm_medium","utm_campaign","utm_content","utm_term","fbclid"].flatMap(key=>params.get(key)?[[key,params.get(key)]]:[]));',context);
 const attribution=vm.runInContext('bookingAttributionValues("test")',context);
 assert.deepEqual(JSON.parse(JSON.stringify(attribution)),{utm_source:"facebook",utm_medium:"paid_social",utm_campaign:"fall_party_special",utm_content:"pumpkin_static",utm_term:"ad_set",fbclid:"meta-click"});
 vm.runInContext('location.search="?utm_source=google&gclid=later-click"',context);
 const unchanged=vm.runInContext('bookingAttributionValues("test")',context);
 assert.deepEqual(JSON.parse(JSON.stringify(unchanged)),JSON.parse(JSON.stringify(attribution)));
});
for(const kind of ["item","date"]){
 test(`one ${kind} click persists once, replay dedupes, intentional repeat increments`,()=>{
  const {context,requests}=harness();
  const click=kind==="item"?'noteInventoryInteraction({id:"item-1",name:"Tent",category:"Tents",daily_price_cents:100},"browse")':'applyDate("2026-09-20","date_first")';
  vm.runInContext(click,context);
  const clicks=()=>requests.filter(row=>kind==="item"?row.event==="inventory_item_clicked":row.event.includes("date_selected"));
  assert.equal(clicks().length,1);
  assert.equal(requests.filter(row=>row.event==="booking_cta_click"||row.event==="date_selected").length,0);
  const persisted=new Set<string>();
  const save=(row:any)=>{context.body=row;persisted.add(vm.runInContext("eventKeyFor(body)",context));};
  save(clicks()[0]);save(JSON.parse(JSON.stringify(clicks()[0])));
  assert.equal(persisted.size,1);
  vm.runInContext(click,context);
  assert.equal(clicks().length,2);
  save(clicks()[1]);assert.equal(persisted.size,2);
  assert.notEqual(clicks()[0].interactionId,clicks()[1].interactionId);
 });
}
test("card handler ignores child controls while direct card clicks count",()=>{
 const handler=booking.match(/onClick=\{(event=>\{if\(event.target instanceof Element[\s\S]*?noteInventoryInteraction\(item,"browse"\);\})\}/)?.[1];
 assert.ok(handler);
 let clicks=0;
 class Element{control:boolean;constructor(control:boolean){this.control=control;}closest(){return this.control?{}:null;}}
 const context=vm.createContext({Element,item:{},noteInventoryInteraction:()=>clicks++});
 const onClick=vm.runInContext(`(${handler})`,context);
 onClick({target:new Element(true)});assert.equal(clicks,0);
 onClick({target:new Element(false)});assert.equal(clicks,1);
 assert.match(tracker,/target.closest\("\[data-funnel-click-owned\]"\)/);
 assert.match(booking,/<article data-funnel-click-owned="true"/);
});
test("clicked dates have a highlight and preserve count text and selected state",()=>{
 const template=page.match(/className=\{(`marketing-demand-day\$\{cell.count[\s\S]*?`)\}/)?.[1];assert.ok(template);
 for(const count of [0,1,4]){
  const className=vm.runInNewContext(template,{cell:{count,date:"2026-09-20"},selectedDate:"2026-09-20"});
  assert.equal(className.includes("has-clicks"),count>0);assert.ok(className.includes("selected"));
 }
 assert.match(page,/<small>\{cell.count\}<\/small>/);
 assert.match(read("app/globals.css"),/\.marketing-demand-day.has-clicks\{background:#dbeafe;border-color:#93b4ff\}/);
});
test("ingestion passes interaction ID to unique event key, including legacy fallback",()=>{
 assert.match(route,/eventKeyFor\(\{sessionId,event,interactionId:body.interactionId/);
 assert.match(route,/event:"inventory_item_view",interactionId:body.interactionId/);
 assert.match(read("supabase/migrations/20260817000100_booking_funnel_attribution.sql"),/event_key text unique/);
});
test("POST persists one row for retried click payloads and accepts a new click ID",async()=>{
 const rows=new Map<string,any>();
 const db={from:(table:string)=>({
  select(){return this;},ilike(){return this;},eq(){return this;},maybeSingle:async()=>({data:{business_id:"business-1"}}),
  insert:async(row:any)=>{
   if(table!=="booking_funnel_events")return {error:null};
   if(rows.has(row.event_key))return {error:{code:"23505"}};
   rows.set(row.event_key,row);return {error:null};
  },
 })};
 const context=vm.createContext({exports:{},NextResponse:Response,attributionKeys:[],normalizeMarketingSource:()=>"direct",bookingFunnelEnabled:()=>true,bookingFunnelEvents:["inventory_item_clicked","event_date_selected"],getSupabaseAdmin:()=>db,unstable_cache:(fn:any)=>fn,validSessionId:(id:unknown)=>typeof id==="string"&&/^[0-9a-f-]{36}$/i.test(id),process:{env:{}},console});
 vm.runInContext(compile(route.replace(/^import .*;\n/gm,"")),context);
 for(const event of ["inventory_item_clicked","event_date_selected"]){
  const payload={sessionId:crypto.randomUUID(),interactionId:crypto.randomUUID(),event,metadata:{date:"2026-09-20"}};
  const before=rows.size;
  const post=async()=>context.exports.POST(new Request("https://test/funnel",{method:"POST",body:JSON.stringify(payload)}),{params:Promise.resolve({businessSlug:"test"})});
  assert.equal((await post()).status,204);
  assert.equal((await post()).status,204);
  assert.equal(rows.size,before+1);
  payload.interactionId=crypto.randomUUID();await post();assert.equal(rows.size,before+2);
 }
});
test("rental item report counts click events rather than view aliases",()=>{
 const context=vm.createContext({});
 vm.runInContext(compile(declaration(page,"canonicalEventName")+declaration(page,"buildRentalItemAnalytics")),context);
 const rows=vm.runInContext('buildRentalItemAnalytics(["inventory_item_clicked","inventory_view","inventory_item_view"].map(event_name=>({event_name,inventory_item_id:"item-1"})),[],new Map(),new Map())',context);
 assert.equal(rows[0].clicks,1);
});
