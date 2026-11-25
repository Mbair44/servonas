import {requireWorkspace} from "@/lib/workspace";

export async function CustomerMergeActivity({businessSlug,customerId}:{businessSlug:string;customerId:string}){
 const {supabase,business}=await requireWorkspace(businessSlug);
 const {data}=await supabase.from("business_activity").select("id,summary,created_at")
  .eq("business_id",business.id).eq("entity_type","customer").eq("entity_id",customerId)
  .eq("action","customer_merged").order("created_at",{ascending:false}).limit(20);
 if(!(data??[]).length)return null;
 return <section className="workspace-panel"><h2>Merge history</h2>{data!.map(event=><p key={event.id}>{event.summary} · {new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.created_at))}</p>)}</section>;
}
