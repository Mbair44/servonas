type Db={from:(table:string)=>any};

/**
 * Customer merge keeps consent on the actual email address or E.164 number.
 * This lookup deliberately treats the contact-channel ledger as authoritative
 * once it exists; a missing row remains unknown rather than becoming consent.
 */
export async function exactChannelConsent(db:Db,input:{businessId:string;channel:"email"|"phone";value:string}){
 const normalized=input.channel==="email"?input.value.trim().toLowerCase():input.value.trim();
 if(!normalized)return "unknown";
 const {data,error}=await db.from("customer_contact_channels").select("consent_status")
  .eq("business_id",input.businessId).eq("channel_type",input.channel)
  .eq("normalized_value",normalized).eq("is_active",true).maybeSingle();
 if(error)throw new Error("Customer contact consent could not be checked.");
 return String(data?.consent_status??"unknown");
}

export async function canSendExactChannel(db:Db,input:{businessId:string;channel:"email"|"phone";value:string;purpose:"marketing"|"transactional"}){
 const status=await exactChannelConsent(db,input);
 if(input.channel==="phone")return input.purpose==="marketing"?status==="express":status!=="opted_out";
 return input.purpose==="marketing"?status==="subscribed":status!=="unsubscribed";
}
