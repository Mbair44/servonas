import "server-only";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {getSubaccountTwilioHttpClient} from "@/lib/twilio/twilioHttp";

// TEMPORARY: remove this file and its page.tsx integration after resource linkage.
const businessId="cb25acc0-3623-4c06-9041-89a88f4ad6ed";
const serviceSid="MG75c5f096e1531a4bfd072ecb405244f8";
const brandSid="BN6de154c8ebffa68df5e874630d4846dd";
const profileSid="BUb95d1fd4604237ee7a740348e9ef5c9b";
const campaignFields=["sid","brand_registration_sid","messaging_service_sid","campaign_id","campaign_status"];
type Row=Record<string,unknown>;
type Result={rows:Row[];more:boolean;error:string|null};
const pick=(row:Row,fields:string[])=>Object.fromEntries(fields.map(field=>[field,typeof row[field]==="string"?row[field]:null]));
const matching=(row:Row)=>row.brand_registration_sid===brandSid&&row.messaging_service_sid===serviceSid&&row.campaign_id==="CKZW1Z5";

export async function readTemporaryDiagnostic(){
 const session=await createSupabaseServerClient(),{data:{user}}=await session.auth.getUser();
 if(!isServonasPlatformAdmin(user))throw new Error("Unauthorized");
 const db=getSupabaseAdmin();
 if(!db)throw new Error("Tenant account storage unavailable");
 const {data:account,error:accountError}=await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",businessId).maybeSingle();
 const accountSid=account?.twilio_subaccount_sid;
 if(accountError||typeof accountSid!=="string"||!accountSid)throw new Error("Tenant account unavailable");
 const token=await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId,subaccountSid:accountSid});
 if(!token)throw new Error("Tenant credential unavailable");
 const client=getSubaccountTwilioHttpClient(accountSid,token);
 // Fixed endpoints only. Never follow provider links or call sync/provision/send helpers.
 const list=async(url:string,key:string,fields:string[]):Promise<Result>=>{
  try{
   const response=await client.request<Row>(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(15000)});
   const rows=response[key];if(!Array.isArray(rows)||rows.some(row=>!row||typeof row!=="object"))throw new Error("Unexpected response");
   const meta=response.meta as Row|undefined;
   return {rows:rows.map(row=>pick(row,fields)),more:Boolean(meta?.next_page_url||response.next_page_uri),error:null};
  }catch{return {rows:[],more:false,error:"Read unavailable (access denied, timeout, or unexpected response)."};}
 };
 const [campaigns,phones,products]=await Promise.all([
  list(`https://messaging.twilio.com/v1/Services/${serviceSid}/Compliance/Usa2p`,"compliance",campaignFields),
  list(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=%2B14804855057`,"incoming_phone_numbers",["sid","phone_number","account_sid","status"]),
  list("https://trusthub.twilio.com/v1/TrustProducts?PageSize=20","results",["sid","friendly_name","status","account_sid","policy_sid"]),
 ]);
 // Only display the exact requested number owned by this subaccount.
 phones.rows=phones.rows.filter(row=>row.phone_number==="+14804855057"&&row.account_sid===accountSid);
 const trusts=await Promise.all(products.rows.map(async product=>({product,assignments:
  typeof product.sid==="string"&&/^BU[0-9a-f]{32}$/i.test(product.sid)&&product.account_sid===accountSid
   ?await list(`https://trusthub.twilio.com/v1/TrustProducts/${product.sid}/EntityAssignments?PageSize=50`,"results",["sid","trust_product_sid","account_sid","object_sid","object_type"])
   :{rows:[],more:false,error:"Assignments not queried: product identity or account did not match."}
 })));
 // Keep the real account identifier server-side; expose only the ownership comparison.
 const publicResult=(result:Result):Result=>({...result,rows:result.rows.map(row=>{
  const {account_sid,...fields}=row;
  return account_sid===undefined?fields:{...fields,account_matches_tenant:account_sid===accountSid};
 })});
 return {campaigns,phones:publicResult(phones),products:publicResult(products),trusts:trusts.map(({product,assignments})=>({product:publicResult({rows:[product],more:false,error:null}).rows[0],assignments:publicResult(assignments)}))};
}

function Notice({result}:{result:Result}){return <>{result.error&&<p role="status">{result.error}</p>}{!result.error&&!result.rows.length&&<p>No matching resources returned.</p>}{result.more&&<p>Partial inventory: additional pages exist and are not shown by this temporary diagnostic.</p>}</>;}
export default async function TemporaryDiagnostic({run}:{run:boolean}){
 let data:Awaited<ReturnType<typeof readTemporaryDiagnostic>>|null=null,error=false;
 if(run){try{data=await readTemporaryDiagnostic();}catch{error=true;}}
 return <section className="workspace-panel" aria-labelledby="temporary-twilio-diagnostic">
  <h2 id="temporary-twilio-diagnostic">Temporary · Copper State Bounce resource diagnostic</h2>
  <p>Read-only lookup. No SMS is sent and no resource or database linkage is changed.</p>
  <form method="get" action="/app/admin/twilio"><button className="sv-button" name="diagnostic" value="1">Run temporary read-only diagnostic</button></form>
  {error&&<p role="alert">Diagnostic unavailable. Check platform-admin access and the existing tenant Vault configuration.</p>}
  {data&&<>
   <h3>A2P campaigns</h3><Notice result={data.campaigns}/>
   <p>Highlighted rows match the requested Brand, Messaging Service and CKZW1Z5. Expected status: VERIFIED; expected compliance SID prefix: QE. Actual values are shown unchanged.</p>
   <div style={{overflowX:"auto"}}><table><thead><tr>{campaignFields.map(field=><th key={field}>{field}</th>)}</tr></thead><tbody>{data.campaigns.rows.map((row,index)=><tr key={index} aria-label={matching(row)?"Matching campaign":undefined} style={matching(row)?{background:"#dbeafe",color:"#172554",fontWeight:700}:undefined}>{campaignFields.map(field=><td key={field}>{String(row[field]??"—")}</td>)}</tr>)}</tbody></table></div>
   {!data.campaigns.error&&!data.campaigns.rows.some(matching)&&<p>No exact campaign match found in the returned rows.</p>}
   <h3>Phone +14804855057</h3><Notice result={data.phones}/><pre style={{overflowX:"auto"}}>{JSON.stringify(data.phones.rows,null,2)}</pre>
   <h3>Subaccount Trust Product candidates</h3>
   <p>Trust Products use BU SIDs; BV SIDs below identify entity assignments, which have no approval status of their own. Product status is shown separately. No candidate is selected automatically. An empty or inaccessible subaccount inventory does not establish that a parent-owned product is absent.</p>
   <p>Customer Profile to compare with object_sid: {profileSid}</p><Notice result={data.products}/>
   {data.trusts.map(({product,assignments},index)=><article key={index}><pre style={{overflowX:"auto"}}>{JSON.stringify(product,null,2)}</pre><h4>Entity assignments</h4><Notice result={assignments}/><pre style={{overflowX:"auto"}}>{JSON.stringify(assignments.rows,null,2)}</pre></article>)}
  </>}
 </section>;
}
