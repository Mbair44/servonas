import {getSupabaseAdmin} from "../supabaseAdmin.ts";
export async function isBusinessTwilioEnabled(businessId:string){const db=getSupabaseAdmin();if(!db)return false;const {data,error}=await db.from("business_twilio_access").select("enabled").eq("business_id",businessId).maybeSingle();if(error){console.error("Twilio access check failed",{businessId,code:error.code});return false;}return data?.enabled===true;}
export async function requireBusinessTwilioEnabled(businessId:string){if(!await isBusinessTwilioEnabled(businessId))throw new Error("Twilio is not enabled for this business.");}
