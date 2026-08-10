import {NextResponse} from "next/server";
import {getBusinessTwilioContext,reconcileBusinessTwilioWebhookSecret} from "@/lib/twilio/businessTwilioProvider";
import {requireTwilioPlatformAdmin,uuidPattern} from "@/lib/twilio/adminRoute";

export async function GET(_request:Request,{params}:{params:Promise<{businessId:string}>}){
 const unauthorized=await requireTwilioPlatformAdmin();if(unauthorized)return unauthorized;const {businessId}=await params;
 if(!uuidPattern.test(businessId))return NextResponse.json({error:"Invalid businessId"},{status:400});
 try{const account=await getBusinessTwilioContext(businessId),available=account?.webhookSecretStatus==="available";return NextResponse.json({security:{subaccountExists:Boolean(account?.subaccountSid),subaccountSid:account?.subaccountSid??null,secureWebhookCredentialAvailable:available,credentialStatus:account?.webhookSecretStatus??"missing",credentialVersion:account?.webhookSecretVersion??0,credentialLastUpdated:account?.webhookSecretUpdatedAt??null,inboundWebhookSecurityReady:Boolean(account?.subaccountSid&&available)}});}catch{return NextResponse.json({error:"Twilio security status is unavailable."},{status:502});}
}

// Explicit, idempotent remediation only. It fetches the already-mapped Twilio
// subaccount and stores its returned token directly in Vault. It cannot create an
// account and never returns the credential.
export async function POST(_request:Request,{params}:{params:Promise<{businessId:string}>}){
 const unauthorized=await requireTwilioPlatformAdmin();if(unauthorized)return unauthorized;const {businessId}=await params;
 if(!uuidPattern.test(businessId))return NextResponse.json({error:"Invalid businessId"},{status:400});
 try{return NextResponse.json({security:await reconcileBusinessTwilioWebhookSecret(businessId)});}catch{return NextResponse.json({error:"The existing Twilio webhook credential could not be reconciled securely."},{status:502});}
}
