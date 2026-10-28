import {WorkspaceNav} from "../../WorkspaceNav";
import {requireWorkspace} from "@/lib/workspace";
import {canManageBusiness} from "@/lib/access";
import {saveGiveaway,setGiveawayStatus} from "./actions";

function localDateTime(value:string|null|undefined,timeZone:string){
 if(!value)return "";
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
 const part=(type:string)=>parts.find(item=>item.type===type)?.value??"";
 return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function GiveawayFields({giveaway,discounts}:{giveaway?:any;discounts:any[]}){
 return <>
  <label className="wide">Title<input name="title" required defaultValue={giveaway?.title}/></label>
  <label>Page URL<input name="slug" pattern="[a-z0-9-]{2,80}" defaultValue={giveaway?.slug}/></label>
  <label>Prize<input name="prize" required placeholder="$200 rental credit" defaultValue={giveaway?.prize}/></label>
  <label>Entry starts<input name="startsAt" type="datetime-local" required defaultValue={giveaway?.startsAt}/></label>
  <label>Entry ends<input name="endsAt" type="datetime-local" required defaultValue={giveaway?.endsAt}/></label>
  <label>Entry discount<select name="discountId" defaultValue={giveaway?.discount_id??""}><option value="">None</option>{discounts?.map(discount=><option key={discount.id} value={discount.id}>{discount.code} — {discount.name}</option>)}</select></label>
  <label>Campaign<input name="campaign" defaultValue={giveaway?.attribution_campaign}/></label>
  <label className="wide">Description<textarea name="description" defaultValue={giveaway?.description}/></label>
  <label className="wide">Eligibility rules<textarea name="eligibilityRules" required defaultValue={giveaway?.eligibility_rules}/></label>
  <label className="wide">Official rules URL <small>Optional public rules page</small><input name="officialRulesUrl" type="url" defaultValue={giveaway?.official_rules_url}/></label>
  <label className="wide">Privacy URL <small>Optional public privacy page</small><input name="privacyUrl" type="url" defaultValue={giveaway?.privacy_url}/></label>
 </>;
}

export default async function Page({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,{supabase,business,role}=await requireWorkspace(businessSlug),edit=canManageBusiness(role);
 const [{data:rows},{data:discounts},{data:site}]=await Promise.all([
  supabase.from("event_giveaways").select("*").eq("business_id",business.id).order("created_at",{ascending:false}),
  supabase.from("discounts").select("id,name,code").eq("business_id",business.id),
  supabase.from("business_website_settings").select("custom_domain,domain_status,public_slug").eq("business_id",business.id).maybeSingle(),
 ]);
 const origin=site?.domain_status==="connected"?`https://${site.custom_domain}`:`/sites/${site?.public_slug}`;
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><h1>Event giveaways</h1>
  {edit&&<details className="workspace-panel" open><summary>Create giveaway</summary><form action={saveGiveaway.bind(null,businessSlug,undefined)} className="discount-form-grid"><GiveawayFields discounts={discounts??[]}/><button className="sv-button">Save draft</button></form></details>}
  <div className="discount-grid">{rows?.map((giveaway:any)=>{
   const previewUrl=giveaway.status==="published"?`${origin}/giveaways/${giveaway.slug}`:`/app/${businessSlug}/marketing/giveaways/${giveaway.id}/preview`;
   const editValues={...giveaway,startsAt:localDateTime(giveaway.entry_starts_at,business.timezone??"America/Phoenix"),endsAt:localDateTime(giveaway.entry_ends_at,business.timezone??"America/Phoenix")};
   return <article className="workspace-panel" key={giveaway.id}><h2>{giveaway.title}</h2><p>{giveaway.status} · {giveaway.prize}</p><a href={previewUrl} target={giveaway.status==="published"?"_blank":undefined}>Preview</a>
    {edit&&giveaway.status!=="published"&&<details className="giveaway-edit"><summary>Edit draft</summary><form action={saveGiveaway.bind(null,businessSlug,giveaway.id)} className="discount-form-grid"><GiveawayFields giveaway={editValues} discounts={discounts??[]}/><button className="sv-button">Save changes</button></form></details>}
    {edit&&giveaway.status!=="published"&&<form action={setGiveawayStatus.bind(null,businessSlug,giveaway.id,"published")}><button className="sv-button">Publish</button></form>}
    {edit&&giveaway.status==="published"&&<form action={setGiveawayStatus.bind(null,businessSlug,giveaway.id,"closed")}><button className="sv-button sv-secondary">Close</button></form>}
    <a href={`/api/giveaways/${businessSlug}/${giveaway.id}/qr?format=png`}>Download QR PNG</a></article>;
  })}</div>
 </section></main>;
}
