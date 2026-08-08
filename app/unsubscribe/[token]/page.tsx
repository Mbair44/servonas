import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {unsubscribeCampaignEmail} from "./actions";

export default async function UnsubscribePage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{success?:string;error?:string}>}){
 const {token}=await params,q=await searchParams,db=getSupabaseAdmin();
 const {data:recipient}=db&&/^[0-9a-f-]{36}$/i.test(token)?await db.from("customer_campaign_recipients").select("unsubscribed_at,customers(marketing_email_status),customer_campaigns(channel,businesses(name))").eq("tracking_token",token).maybeSingle():{data:null};
 const campaign=Array.isArray(recipient?.customer_campaigns)?recipient.customer_campaigns[0]:recipient?.customer_campaigns,business=campaign&&(Array.isArray(campaign.businesses)?campaign.businesses[0]:campaign.businesses),customer=Array.isArray(recipient?.customers)?recipient?.customers[0]:recipient?.customers;
 const valid=Boolean(recipient&&campaign?.channel==="email"),done=q.success==="1"||recipient?.unsubscribed_at||customer?.marketing_email_status==="unsubscribed";
 return <main className="unsubscribe-page"><section><span aria-hidden="true">✉</span>{!valid?<><h1>Link unavailable</h1><p>This unsubscribe link is invalid or no longer available.</p></>:done?<><h1>You’re unsubscribed</h1><p>You will no longer receive campaign emails from {business?.name||"this business"}. Service-related messages such as appointment and invoice emails may still be sent.</p></>:<><h1>Unsubscribe from emails?</h1><p>Confirm that you no longer want to receive campaign emails from {business?.name||"this business"}.</p>{q.error&&<p className="unsubscribe-error">The preference could not be saved. Please try again.</p>}<form action={unsubscribeCampaignEmail.bind(null,token)}><button>Unsubscribe</button></form><small>This does not stop appointment, invoice, or other necessary service messages.</small></>}</section></main>;
}
