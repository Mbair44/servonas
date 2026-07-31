import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
import {updateTrialPeriod} from "../entitlements/actions";

export default async function TrialAdministration({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const query=await searchParams,session=await createSupabaseServerClient(),{data:{user}}=await session.auth.getUser();
 if(!isServonasPlatformAdmin(user))redirect("/app");
 const admin=getSupabaseAdmin();if(!admin)throw new Error("Platform administration is unavailable.");
 const [{data:subscriptions,error},{data:businesses},{data:entitlements}]=await Promise.all([
  admin.from("business_platform_subscriptions").select("business_id,status,trial_ends_at,stripe_subscription_id").in("status",["checkout_pending","trialing"]).order("trial_ends_at"),
  admin.from("businesses").select("id,name,slug").eq("is_deleted",false),
  admin.from("business_entitlements").select("id,business_id,ends_at,version,status").in("status",["active","grace_period"]),
 ]);
 if(error)throw new Error("Trial subscriptions could not be loaded.");
 const businessById=new Map((businesses??[]).map(item=>[item.id,item])),entitlementByBusiness=new Map((entitlements??[]).map(item=>[item.business_id,item]));
 return <main className="admin-entitlements"><header><div><span className="sv-kicker">Internal administration</span><h1>Trial periods</h1><p>Change an individual tenant’s trial deadline. Trialing Stripe subscriptions are updated at the same time.</p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href="/app/admin/entitlements">Entitlements</Link><Link className="sv-button sv-secondary" href="/app">Workspaces</Link></div></header>{query.error&&<div className="workspace-notice error">{query.error}</div>}{query.success&&<div className="workspace-notice success">{query.success}</div>}<section>{(subscriptions??[]).map(subscription=>{const business=businessById.get(subscription.business_id),entitlement=entitlementByBusiness.get(subscription.business_id);if(!business||!entitlement)return null;const date=(subscription.trial_ends_at??entitlement.ends_at)?.slice(0,10)??"";return <article className="workspace-panel" key={subscription.business_id}><div className="panel-title"><div><span className="sv-kicker">{business.slug}</span><h2>{business.name}</h2><p>{subscription.status.replaceAll("_"," ")} · {date?`trial ends ${new Date(`${date}T12:00:00Z`).toLocaleDateString()}`:"no deadline"}</p></div><span className={`estimate-status ${subscription.status}`}>{subscription.status.replaceAll("_"," ")}</span></div><form action={updateTrialPeriod} className="entitlement-admin-form"><input type="hidden" name="businessId" value={business.id}/><input type="hidden" name="entitlementId" value={entitlement.id}/><input type="hidden" name="version" value={entitlement.version}/><label>Trial end date<input required name="trialEndsAt" type="date" defaultValue={date}/></label><label>Administrative reason<textarea required minLength={5} name="reason" placeholder="Why is this trial changing?"/></label><label>Confirmation<input required name="confirmation" pattern="CONFIRM" placeholder="Type CONFIRM"/></label><button className="sv-button">Update trial date</button></form></article>})}{!subscriptions?.length&&<div className="workspace-panel"><p>No pending or trialing subscriptions were found.</p></div>}</section></main>;
}
