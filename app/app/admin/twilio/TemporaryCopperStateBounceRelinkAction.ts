"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isServonasPlatformAdmin } from "@/lib/platformAccess";
import { getSubaccountWebhookSecretResolver } from "@/lib/twilio/subaccountWebhookSecrets";
import { getSubaccountTwilioHttpClient } from "@/lib/twilio/twilioHttp";
import { verifyTenantReadiness } from "@/lib/twilio/liveReadiness";

// TEMPORARY: delete this file and TemporaryCopperStateBounceRelink.tsx after CSB linkage.
const businessId = "cb25acc0-3623-4c06-9041-89a88f4ad6ed";
const brandSid = "BN6de154c8ebffa68df5e874630d4846dd";
const campaignSid = "QE2c6890da8086d771620e9b13fadeba0b";
const messagingServiceSid = "MG75c5f096e1531a4bfd072ecb405244f8";
const phoneSid = "PN2f36bf13572ff8b9e3602635d8625afd";
const phone = "+14804855057";
const isSid = (value: string, prefix: string) => new RegExp(`^${prefix}[0-9A-Za-z]{32}$`).test(value);
const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
type RelinkFailure = "verify_twilio_failed" | "account_row_missing" | "activation_row_missing" | "phone_upsert_failed" | "compliance_upsert_failed" | "vault_failed" | "readiness_failed";
const fail = (stage: RelinkFailure) => redirect(`/app/admin/twilio?relink=${stage}`);

type Account = { sid?: string; owner_account_sid?: string; status?: string };
type Resource = { sid?: string; account_sid?: string; service_sid?: string; messaging_service_sid?: string; brand_registration_sid?: string; campaign_status?: string; phone_number?: string; status?: string };

export async function relinkCopperStateBounce(form: FormData) {
 const session = await createSupabaseServerClient();
 const { data: { user } } = await session.auth.getUser();
 const targetAccountSid = value(form, "targetAccountSid");
 const targetAuthToken = String(form.get("targetAuthToken") ?? "").trim();
 if (!isServonasPlatformAdmin(user) || value(form, "confirmation") !== "RELINK CSB" || !isSid(targetAccountSid, "AC") || targetAuthToken.length < 20 || targetAuthToken.length > 128) return fail("verify_twilio_failed");
 let outcome = "verify_twilio_failed";
 const abort = (stage: RelinkFailure): never => { outcome = stage; throw new Error("relink_stage"); };
 try {
  const tenant = getSubaccountTwilioHttpClient(targetAccountSid, targetAuthToken);
  const [tenantAccount, brand, service, campaign, providerPhone, senderPool] = await Promise.all([
   tenant.request<Account>(`https://api.twilio.com/2010-04-01/Accounts/${targetAccountSid}.json`, { method: "GET" }),
   tenant.request<Resource>(`https://messaging.twilio.com/v1/a2p/BrandRegistrations/${brandSid}`, { method: "GET" }),
   tenant.request<Resource>(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}`, { method: "GET" }),
   tenant.request<Resource>(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}/Compliance/Usa2p/${campaignSid}`, { method: "GET" }),
   tenant.request<Resource>(`https://api.twilio.com/2010-04-01/Accounts/${targetAccountSid}/IncomingPhoneNumbers/${phoneSid}.json`, { method: "GET" }),
   tenant.request<Resource>(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}/PhoneNumbers/${phoneSid}`, { method: "GET" }),
  ]);
  if (tenantAccount.sid !== targetAccountSid || tenantAccount.status !== "active" || brand.sid !== brandSid || brand.account_sid !== targetAccountSid || brand.status?.toUpperCase() !== "APPROVED" || service.sid !== messagingServiceSid || service.account_sid !== targetAccountSid || campaign.sid !== campaignSid || campaign.account_sid !== targetAccountSid || campaign.messaging_service_sid !== messagingServiceSid || campaign.brand_registration_sid !== brandSid || campaign.campaign_status?.toUpperCase() !== "VERIFIED" || providerPhone.sid !== phoneSid || providerPhone.account_sid !== targetAccountSid || providerPhone.phone_number !== phone || senderPool.sid !== phoneSid || senderPool.account_sid !== targetAccountSid || senderPool.service_sid !== messagingServiceSid) abort("verify_twilio_failed");

  const db = getSupabaseAdmin() ?? abort("account_row_missing");
  const [accountResult, activationResult, phoneResult, complianceResult] = await Promise.all([
   db.from("business_twilio_accounts").select("id,twilio_subaccount_sid,twilio_subaccount_status,provisioning_status,provisioning_error,external_twilio_account").eq("business_id", businessId).maybeSingle(),
   db.from("twilio_tenant_activations").select("id,status,current_step,brand_registration_sid,campaign_sid,messaging_service_sid,phone_number_sid,legacy_sms_preserved,outbound_sender_mode,last_error_category").eq("business_id", businessId).maybeSingle(),
   db.from("twilio_phone_numbers").select("id,twilio_phone_number_sid,phone_number_e164,messaging_service_sid,status,provisioning_status,provisioning_error,is_primary").eq("business_id", businessId).eq("phone_number_e164", phone).maybeSingle(),
   db.from("twilio_compliance_registrations").select("id,twilio_brand_sid,twilio_customer_profile_sid,twilio_trust_product_sid,status").eq("business_id", businessId).eq("registration_type", "secondary_customer_profile").maybeSingle(),
  ]);
  const account = accountResult.data;
  const activation = activationResult.data;
  if (accountResult.error) abort("account_row_missing");
  if (!account) { outcome = "account_row_missing"; throw new Error("relink_stage"); }
  if (activationResult.error) abort("activation_row_missing");
  if (phoneResult.error) abort("phone_upsert_failed");
  if (complianceResult.error) abort("compliance_upsert_failed");
  const accountId = account.id;
  const now = new Date().toISOString();
  const previousState = { account: accountResult.data, activation: activationResult.data, phone: phoneResult.data, compliance: complianceResult.data };
  const accountUpdate = await db.from("business_twilio_accounts").update({ twilio_subaccount_sid: targetAccountSid, twilio_subaccount_status: "active", provisioning_status: "active", provisioning_error: null, external_twilio_account: true, external_twilio_previous_state: previousState, last_synced_at: now, updated_at: now }).eq("id", accountId).eq("business_id", businessId);
  if (accountUpdate.error) abort("account_row_missing");
  const activationFields = { business_twilio_account_id: accountId, brand_registration_sid: brandSid, campaign_sid: campaignSid, messaging_service_sid: messagingServiceSid, phone_number_sid: phoneSid, status: "active", current_step: "complete", outbound_sender_mode: "messaging_service", legacy_sms_preserved: false, last_error_category: null, updated_at: now };
  const activationWrite = activation
    ? await db.from("twilio_tenant_activations").update(activationFields).eq("id", activation.id).eq("business_id", businessId)
    : await db.from("twilio_tenant_activations").insert({ business_id: businessId, ...activationFields });
  if (activationWrite.error) abort("activation_row_missing");
  const phoneFields = { business_twilio_account_id: accountId, twilio_phone_number_sid: phoneSid, phone_number_e164: phone, messaging_service_sid: messagingServiceSid, status: "active", provisioning_status: "active", provisioning_error: null, is_primary: true, last_synced_at: now, updated_at: now };
  const phoneWrite = phoneResult.data ? await db.from("twilio_phone_numbers").update(phoneFields).eq("id", phoneResult.data.id).eq("business_id", businessId) : await db.from("twilio_phone_numbers").insert({ business_id: businessId, ...phoneFields });
  if (phoneWrite.error) abort("phone_upsert_failed");
  const complianceWrite = complianceResult.data ? await db.from("twilio_compliance_registrations").update({ business_twilio_account_id: accountId, twilio_brand_sid: brandSid, updated_at: now }).eq("id", complianceResult.data.id).eq("business_id", businessId) : await db.from("twilio_compliance_registrations").insert({ business_id: businessId, business_twilio_account_id: accountId, twilio_brand_sid: brandSid, registration_type: "secondary_customer_profile", status: "draft" });
  if (complianceWrite.error) abort("compliance_upsert_failed");
  const vault = await getSubaccountWebhookSecretResolver().storeSubaccountAuthToken({ businessId, subaccountSid: targetAccountSid, authToken: targetAuthToken });
  if (vault.status !== "available") abort("vault_failed");
  try { const readiness = await verifyTenantReadiness(businessId); outcome = readiness.state === "ready" ? "ready" : "readiness_failed"; } catch { outcome = "readiness_failed"; }
 } catch {
  // outcome already identifies the failed stage; provider details remain server-side.
 }
 redirect(`/app/admin/twilio?relink=${outcome}`);
}
