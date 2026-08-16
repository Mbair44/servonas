import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {unsubscribePlatformEmail} from "./actions";

export default async function PlatformUnsubscribePage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{success?:string;error?:string}>}){
 const {token}=await params,q=await searchParams,db=getSupabaseAdmin();
 const {data:recipient}=db&&/^[0-9a-f-]{36}$/i.test(token)?await db.from("platform_email_recipients").select("unsubscribed_at").eq("tracking_token",token).maybeSingle():{data:null};
 const done=q.success==="1"||Boolean(recipient?.unsubscribed_at);
 return <main className="unsubscribe-page"><section><span aria-hidden="true">✉</span>{!recipient?<><h1>Link unavailable</h1><p>This unsubscribe link is invalid or no longer available.</p></>:done?<><h1>You’re unsubscribed</h1><p>You will no longer receive Servonas platform announcements at this address.</p></>:<><h1>Unsubscribe from Servonas emails?</h1><p>Confirm that you no longer want to receive platform announcements from Servonas.</p>{q.error&&<p className="unsubscribe-error">The preference could not be saved. Please try again.</p>}<form action={unsubscribePlatformEmail.bind(null,token)}><button>Unsubscribe</button></form><small>This does not stop necessary service, account, or billing emails.</small></>}</section></main>;
}
