import {notFound} from "next/navigation";
import {WorkspaceNav} from "../../../../WorkspaceNav";
import {requireWorkspace} from "@/lib/workspace";
import {canManageBusiness} from "@/lib/access";

/** Private, non-submitting preview. Published giveaways retain their public route. */
export default async function GiveawayPreview({params}:{params:Promise<{businessSlug:string;giveawayId:string}>}){
 const {businessSlug,giveawayId}=await params;
 const {supabase,business,role}=await requireWorkspace(businessSlug);
 if(!canManageBusiness(role))notFound();
 const {data:giveaway}=await supabase.from("event_giveaways").select("title,description,prize,entry_ends_at,official_rules_url,privacy_url").eq("business_id",business.id).eq("id",giveawayId).maybeSingle();
 if(!giveaway)notFound();
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><div className="business-site-preview-bar">Preview mode — this draft is not public and entries are disabled.</div><article className="workspace-panel"><h1>{giveaway.title}</h1><p>{giveaway.description}</p><h2>Prize: {giveaway.prize}</h2>{giveaway.entry_ends_at&&<p>Entry ends {new Date(giveaway.entry_ends_at).toLocaleString()}</p>}<button className="sv-button" disabled>Enter giveaway</button><p><a href={giveaway.official_rules_url||"/terms"}>Official rules</a> · <a href={giveaway.privacy_url||"/privacy"}>Privacy</a></p></article></section></main>;
}
