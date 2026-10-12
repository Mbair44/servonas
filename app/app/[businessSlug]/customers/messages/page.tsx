import {requireWorkspace} from "@/lib/workspace";
import {loadInbox} from "@/lib/customerMessages/service";
import {WorkspaceNav} from "../../WorkspaceNav";
import {MessagesInbox} from "./MessagesInbox";
export default async function CustomerMessages({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,{supabase,business}=await requireWorkspace(businessSlug);
 // loadInbox retains provider_message_id for canonical delivery evidence.
 const inbox=await loadInbox(supabase,business.id);
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><header className="epic3-header"><div><small>Messages</small><h1>Message inbox</h1><p>Customer texts and replies. Updates every 10 seconds.</p></div></header><MessagesInbox slug={businessSlug} initial={inbox} timezone={business.timezone||"America/Phoenix"}/></section></main>;
}
