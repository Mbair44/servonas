import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {findLocationPage,normalizedLocationKey,locationOpportunityAction} from "../lib/locationPageIdentity.ts";
import {generateLocationPage,type LocationPageSource} from "../lib/locationPages.ts";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("ready cards always offer a dynamic create action without a recommendation record",()=>{
 for(const city of ["Mesa","Chandler","Queen Creek"]){
  assert.deepEqual(locationOpportunityAction(city,null),{label:`Create ${city} page`,state:"Ready to build"});
  assert.equal(locationOpportunityAction(city,{status:"draft"}).label,`Review ${city} draft`);
  assert.equal(locationOpportunityAction(city,{status:"published"}).label,`Edit ${city} page`);
 }
});

test("normalized city/state matches drafts and published pages including legacy source keys",()=>{
 for(const status of ["draft","published"]){
  const page={id:"existing",source_location_key:"legacy-id",city:" Queen   Creek ",state:"az",status};
  assert.equal(findLocationPage([page],"queen creek, AZ"),page);
  assert.equal(findLocationPage([page],"Queen Creek, NM"),null);
  assert.equal(locationOpportunityAction("Queen Creek",page).state,status==="draft"?"Draft created":"Location page published");
 }
 assert.equal(normalizedLocationKey("  MESA ,  az "),"mesa, az");
 assert.equal(findLocationPage([],"Mesa, AZ"),null);
});

test("card action reuses tenant-authorized draft builder and existing review/publish lifecycle",async()=>{
 const [page,actions,editor,migration]=await Promise.all([read("app/app/[businessSlug]/marketing/seo/page.tsx"),read("app/app/[businessSlug]/marketing/seo/actions.ts"),read("app/app/[businessSlug]/marketing/seo/locations/[pageId]/page.tsx"),read("supabase/migrations/20260908000200_business_location_pages.sql")]);
 assert.match(page,/!page\?<form action=\{buildLocationPage.bind/);
 assert.doesNotMatch(page,/!page&&recommendation\?/);
 assert.match(page,/label=\{opportunityAction.label\}/);
 assert.match(page,/findLocationPage\(locationPages\?\?\[\],location.id\)/);
 const build=actions.slice(actions.indexOf("export async function buildLocationPage"),actions.indexOf("async function resolveManualLocation"));
 assert.match(build,/requireWorkspace\(slug\)/);
 assert.match(build,/canManageBusiness\(role\)/);
 assert.match(build,/select\("id,source_location_key,city,state,status"\).eq\("business_id",business.id\)/);
 assert.ok(build.indexOf("if(existing?.id)redirect")<build.indexOf("generateLocationPage"));
 assert.match(build,/source_location_key:storageLocationKey/);
 assert.match(build,/status:"draft"/);
 assert.doesNotMatch(build,/status:"published"/);
 assert.match(build,/error\?\.code==="23505"/);
 assert.match(build,/if\(winner\)redirect\(editorPath/);
 assert.match(build,/revalidatePath\(pagePath\(slug\)\)/);
 assert.match(migration,/unique\(business_id,source_location_key\)/);
 assert.match(editor,/eq\("business_id",business.id\).eq\("id",pageId\)/);
 assert.match(editor,/publishLocationPage.bind/);
 assert.match(editor,/LocationPageEditor page=\{page\}/);
});

test("draft generation uses tenant facts and existing generic slug strategy without copying another city",async()=>{
 const source:LocationPageSource={business:{name:"Example Plumbing",industry:"plumbing",description:"Drain and fixture services",phone:"555-0100",email:"office@example.test",city:"Gilbert",state:"AZ"},location:{name:"Queen Creek, AZ",city:"Queen Creek",state:"AZ",jobCount90d:0,customerCount:0,reviewCount:0},website:{baseUrl:"https://example.test",heroHeading:"Plumbing help",heroSubheading:"Schedule a service",aboutText:"Drain and fixture services",bookingEnabled:true,requestEnabled:true},serviceAreas:["Queen Creek, AZ"],services:[{name:"Drain Cleaning",description:"Clear blocked drains"}],inventory:[{name:"Inspection",description:"Camera inspection",category:"Plumbing"}],hours:[],reviews:[],policies:["Contact us to confirm service availability"]};
 const previousKey=process.env.OPENAI_API_KEY,originalFetch=globalThis.fetch;
 process.env.OPENAI_API_KEY="test-key";
 let request:any;
 globalThis.fetch=async(_url,init)=>{request=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({pageTitle:"",metaDescription:"",ogTitle:"",ogDescription:"",h1:"",heroCopy:"",ctaLabel:"",sections:Array.from({length:4},(_,i)=>({heading:`Service information ${i}`,body:"Discuss the work you need before reserving a visit."})),faqs:Array.from({length:4},(_,i)=>({question:`How do I arrange service ${i}?`,answer:"Contact Example Plumbing to discuss your request."}))})}}]}));};
 try{
  const result=await generateLocationPage({source,existingPages:[]});
  assert.deepEqual(JSON.parse(request.messages[1].content).verifiedTenantData,source);
  assert.equal(result.page.slug,"queen-creek-az-drain-cleaning");
  assert.equal(result.page.h1,"Drain Cleaning in Queen Creek, AZ");
  assert.match(result.page.heroCopy,/Example Plumbing.*Queen Creek/);
  assert.match(result.page.pageTitle,/Drain Cleaning.*Queen Creek.*Example Plumbing/);
  assert.match(result.page.metaDescription,/Example Plumbing/);
  assert.equal(result.page.ctaLabel,"Check Availability");
  assert.match(request.messages[0].content,/Never clone another city page/);
  assert.match(request.messages[0].content,/venue relationships/);
 }finally{globalThis.fetch=originalFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}
});

test("source loading and public location SEO reuse existing tenant-scoped components",async()=>{
 const [actions,domain,slug,sitemap,landing]=await Promise.all([read("app/app/[businessSlug]/marketing/seo/actions.ts"),read("app/sites/domain/[domain]/[promotionSlug]/page.tsx"),read("app/sites/[siteSlug]/[promotionSlug]/page.tsx"),read("app/sitemap.xml/route.ts"),read("components/LocationLanding.tsx")]);
 const source=actions.slice(actions.indexOf("async function locationPageSource"),actions.indexOf("function schemaFor"));
 for(const name of ["load_business","load_website_snapshot","load_services","load_inventory","load_service_areas","load_booking_settings"]){assert.ok(source.includes(name));}
 assert.match(source,/eq\("business_id",businessId\)/);
 for(const route of [domain,slug]){assert.match(route,/LocationLanding/);assert.match(route,/tenantMetadata/);assert.match(route,/published/);}
 assert.match(sitemap,/business_location_pages/);
 assert.match(landing,/application\/ld\+json/);
 assert.match(landing,/categoryPages/);
 assert.match(landing,/page.h1\?\.trim\(\)\|\|locationHeading/);
 assert.match(landing,/page.cta_label\?\.trim\(\)\|\|conversionLabel/);
 assert.match(landing,/nearbyPages/);
});

test("executing create action prepares a tenant draft, reuses existing pages and handles concurrent clicks",async()=>{
 const ts=await import("typescript");
 const identity=await import("../lib/locationPageIdentity.ts");
 const code=ts.transpileModule(await read("app/app/[businessSlug]/marketing/seo/actions.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const mode of ["create","draft","published","race"]){
  const calls:Array<{table:string;operation:string;filters:Record<string,unknown>;value?:any}>=[];
  let inserted:any=null,generatedSource:any=null,reads=0;
  const existing={id:"existing",city:"Mesa",state:"AZ",source_location_key:"legacy",status:mode};
  const db={from(table:string){
   const call={table,operation:"select",filters:{} as Record<string,unknown>,value:undefined as any};calls.push(call);
   const query:any={};
   for(const method of ["select","order","limit","single","maybeSingle","neq","ilike","gte","in"]){query[method]=()=>query;}
   query.eq=(key:string,value:unknown)=>{call.filters[key]=value;return query;};
   for(const operation of ["insert","upsert"]){query[operation]=(value:any)=>{call.operation=operation;call.value=value;return query;};}
   query.then=(resolve:(value:any)=>void)=>{
    let data:any=null,error:any=null;
    if(table==="business_location_pages"){
     if(call.operation==="insert"){
      inserted=call.value;
      if(mode==="race")error={code:"23505"};else data={id:"new-draft"};
     }else{reads++;data=mode==="draft"||mode==="published"||(mode==="race"&&reads>=3)?[existing]:[];}
    }else if(table==="businesses")data={name:"Tenant A",phone:"555",city:"Gilbert",state:"AZ",industry_profile:"plumbing"};
    else if(table==="business_website_settings")data={public_slug:"tenant-a",about_text:"Tenant A plumbing",booking_enabled:true};
    else if(table==="services")data=[{name:"Drain Cleaning",description:"Drain service"}];
    else if(table==="inventory_items")data=[{name:"Camera inspection",category:"Plumbing"}];
    else if(table==="workforce_territories")data=[{name:"Mesa, AZ",strategy_config:{cities:["Mesa"]}}];
    else if(table==="booking_settings")data={enabled:true,public_slug:"tenant-a",standard_rental_hours:24};
    else data=[];
    return Promise.resolve({data,error}).then(resolve);
   };
   return query;
  }};
  const exports:any={};
  const modules:Record<string,unknown>={
   "node:crypto":{randomUUID:()=>"test-operation"},"next/cache":{revalidatePath:()=>{}},
   "next/navigation":{redirect:(path:string)=>{throw Object.assign(new Error(path),{digest:"NEXT_REDIRECT;test"});}},
   "@/lib/access":{canManageBusiness:()=>true},"@/lib/workspace":{requireWorkspace:async()=>({supabase:db,business:{id:"tenant-a"},user:{id:"owner-a"},role:"owner"})},
   "@/lib/supabaseAdmin":{getSupabaseAdmin:()=>null},"@/lib/locationPageIdentity":identity,
   "@/lib/locationPages":{locationSourceVersion:()=>"version",generateLocationPage:async({source}:any)=>{generatedSource=source;return{page:{slug:"mesa-az-drain-cleaning",pageTitle:"Drain Cleaning in Mesa",metaDescription:"Tenant A plumbing in Mesa",h1:"Drain Cleaning in Mesa",heroCopy:"Contact Tenant A",sections:[],faqs:[],ctaLabel:"Check Availability"},similarityScore:0};}},
  };
  new Function("require","exports",code)((name:string)=>{assert.ok(name in modules,`Unexpected import ${name}`);return modules[name];},exports);
  await assert.rejects(()=>exports.buildLocationPage("tenant-a"," Mesa , AZ ","recommendation-key"),new RegExp(`/locations/${mode==="create"?"new-draft":"existing"}`));
  if(mode==="draft"||mode==="published"){assert.equal(inserted,null);assert.equal(generatedSource,null);}
  else{
   assert.equal(inserted.status,"draft");assert.equal(inserted.business_id,"tenant-a");
   assert.equal(inserted.source_location_key,"mesa, az");assert.equal(inserted.published_at,undefined);
   assert.equal(generatedSource.business.name,"Tenant A");assert.equal(generatedSource.location.city,"Mesa");
   assert.equal(generatedSource.services[0].name,"Drain Cleaning");assert.equal(generatedSource.inventory[0].name,"Camera inspection");
   assert.deepEqual(generatedSource.serviceAreas,["Mesa, AZ","Mesa"]);
  }
  for(const call of calls){
   if(call.operation==="select")assert.equal(call.filters[call.table==="businesses"?"id":"business_id"],"tenant-a",call.table);
   else assert.equal(call.value.business_id,"tenant-a",call.table);
  }
 }
});
