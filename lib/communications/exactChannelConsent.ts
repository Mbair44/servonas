type Db={from:(table:string)=>any};
export class ExactChannelConsentError extends Error {readonly code:string;constructor(code:string){super("Customer contact consent could not be checked.");this.name="ExactChannelConsentError";this.code=code;}}
/** Customer merge keeps consent bound to the actual email address or E.164 number. */
export async function exactChannelConsent(db:Db,input:{businessId:string;channel:"email"|"phone";value:string}){
 const normalized=input.channel==="email"?input.value.trim().toLowerCase():input.value.trim();if(!normalized)return "unknown";
 const {data,error}=await db.from("customer_contact_channels").select("consent_status").eq("business_id",input.businessId).eq("channel_type",input.channel).eq("normalized_value",normalized).eq("is_active",true).maybeSingle();
 if(error)throw new ExactChannelConsentError(error.code==="42P01"||/customer_contact_channels|schema cache/i.test(error.message??"")?"consent_schema_unavailable":"consent_lookup_failed");
 return String(data?.consent_status??"unknown");
}
export async function canSendExactChannel(db:Db,input:{businessId:string;channel:"email"|"phone";value:string;purpose:"marketing"|"transactional"}){const status=await exactChannelConsent(db,input);return input.channel==="phone"?(input.purpose==="marketing"?status==="express":status!=="opted_out"):(input.purpose==="marketing"?status==="subscribed":status!=="unsubscribed");}
