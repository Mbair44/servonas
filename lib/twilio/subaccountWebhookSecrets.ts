import {getSupabaseAdmin} from "../supabaseAdmin.ts";

export type SubaccountSecretIdentity={businessId:string;subaccountSid:string};
export type StoreSubaccountSecretInput=SubaccountSecretIdentity&{authToken:string};
export type SubaccountSecretMetadata={status:"missing"|"available"|"rotation_required"|"error";version:number;updatedAt:string|null};
export type SubaccountWebhookSecretResolver={
 storeSubaccountAuthToken(input:StoreSubaccountSecretInput):Promise<SubaccountSecretMetadata>;
 getSubaccountAuthToken(identity:SubaccountSecretIdentity):Promise<string|null>;
 deleteSubaccountAuthToken(identity:SubaccountSecretIdentity):Promise<void>;
 rotateSubaccountAuthToken(input:StoreSubaccountSecretInput):Promise<SubaccountSecretMetadata>;
};

const validIdentity=({businessId,subaccountSid}:SubaccountSecretIdentity)=>
 /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(businessId)&&/^AC[0-9A-Za-z]{32}$/.test(subaccountSid);

export function createSupabaseVaultSecretResolver():SubaccountWebhookSecretResolver{
 const db=getSupabaseAdmin();if(!db)throw new Error("Secure Twilio secret storage is unavailable.");
 const store=async(input:StoreSubaccountSecretInput,action:"store"|"rotate"|"reconcile")=>{
  if(!validIdentity(input)||!input.authToken)throw new Error("Invalid Twilio secret identity.");
  const {data,error}=await db.rpc("store_twilio_subaccount_auth_token",{p_business_id:input.businessId,p_subaccount_sid:input.subaccountSid,p_auth_token:input.authToken,p_action:action});
  if(error)throw new Error("Secure Twilio credential storage failed.");
  const row=(Array.isArray(data)?data[0]:data) as {secret_status?:SubaccountSecretMetadata["status"];secret_version?:number;secret_updated_at?:string}|null;
  if(!row?.secret_status)throw new Error("Secure Twilio credential storage returned no status.");
  return{status:row.secret_status,version:Number(row.secret_version??0),updatedAt:row.secret_updated_at??null};
 };
 return{
  storeSubaccountAuthToken:input=>store(input,"store"),
  async getSubaccountAuthToken(identity){if(!validIdentity(identity))return null;const {data,error}=await db.rpc("get_twilio_subaccount_auth_token",{p_business_id:identity.businessId,p_subaccount_sid:identity.subaccountSid});if(error||typeof data!=="string"||!data)return null;return data;},
  async deleteSubaccountAuthToken(identity){if(!validIdentity(identity))throw new Error("Invalid Twilio secret identity.");const {error}=await db.rpc("delete_twilio_subaccount_auth_token",{p_business_id:identity.businessId,p_subaccount_sid:identity.subaccountSid});if(error)throw new Error("Secure Twilio credential deletion failed.");},
  rotateSubaccountAuthToken:input=>store(input,"rotate"),
 };
}

export const getSubaccountWebhookSecretResolver=()=>createSupabaseVaultSecretResolver();
