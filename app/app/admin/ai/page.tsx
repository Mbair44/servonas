import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
import {setAssistantAccess} from "./actions";

export default async function AiAccessAdmin({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const query=await searchParams,session=await createSupabaseServerClient(),{data:{user}}=await session.auth.getUser();
 if(!isServonasPlatformAdmin(user))redirect("/app");
 const admin=getSupabaseAdmin();if(!admin)throw new Error("Platform administration is unavailable.");
 const [{data:businesses,error},{data:access,error:accessError}]=await Promise.all([admin.from("businesses").select("id,name,slug").eq("is_deleted",false).order("name"),admin.from("business_ai_assistant_access").select("business_id,enabled,enabled_at,updated_at")]);
 if(error)throw new Error("Businesses could not be loaded.");
 if(accessError)throw new Error("AI access could not be loaded. Apply the latest database migration.");
 const byBusiness=new Map((access??[]).map(row=>[row.business_id,row]));
 return <main className="admin-entitlements"><header><div><span className="sv-kicker">Internal administration</span><h1>AI Assistant access</h1><p>Control the paid AI add-on separately for each Servonas business. Access defaults to off.</p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href="/app/admin/usage?view=ai">AI usage &amp; spend</Link><Link className="sv-button sv-secondary" href="/app">Workspaces</Link></div></header>{query.error&&<div className="workspace-notice error">{query.error}</div>}{query.success&&<div className="workspace-notice success">{query.success}</div>}<section>{(businesses??[]).map(business=>{const row=byBusiness.get(business.id),enabled=row?.enabled===true;return <article className="workspace-panel" key={business.id}><div className="panel-title"><div><span className="sv-kicker">{business.slug}</span><h2>{business.name}</h2><p>{enabled?`Enabled${row?.enabled_at?` since ${new Date(row.enabled_at).toLocaleDateString()}`:""}.`:"Not enabled. This business cannot load or call the AI Assistant."}</p></div><span className={`estimate-status ${enabled?"active":"inactive"}`}>{enabled?"enabled":"off"}</span></div><form action={setAssistantAccess} className="entitlement-admin-form"><input type="hidden" name="businessId" value={business.id}/><label>AI Assistant<select name="enabled" defaultValue={String(!enabled)}><option value="true">Enable paid add-on</option><option value="false">Disable access</option></select></label><label>Internal reason<textarea name="reason" required minLength={5}/></label><label>Confirmation<input name="confirmation" required pattern="CONFIRM" placeholder="Type CONFIRM"/></label><button className={`sv-button ${enabled?"sv-danger":""}`}>{enabled?"Disable AI Assistant":"Enable AI Assistant"}</button></form></article>})}</section></main>;
}
