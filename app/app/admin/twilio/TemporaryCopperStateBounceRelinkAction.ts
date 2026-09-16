"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isServonasPlatformAdmin } from "@/lib/platformAccess";
import { getSubaccountWebhookSecretResolver } from "@/lib/twilio/subaccountWebhookSecrets";
import { getParentTwilioHttpClient, getSubaccountTwilioHttpClient } from "@/lib/twilio/twilioHttp";
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
const fail = () => redirect("/app/admin/twilio?relink=failed");

type Account = { sid?: string; owner_account_sid?: string; status?: string };
type Resource = { sid?: string; account_sid?: string; service_sid?: string; messaging_service_sid?: string; brand_registration_sid?: string; campaign_status?: string; phone_number?: string; status?: string };

export async function relinkCopperStateBounce(form: FormData) {
 const session = await createSupabaseServerClient();
 const { data: { user } } = await session.auth.getUser();
 const targetAccountSid = value(form, "targetAccountSid");
 const targetAuthToken = String(form.get("targetAuthToken") ?? "").trim();
 if (!isServonasPlatformAdmin(user) || value(form, "confirmation") !== "RELINK CSB" || !isSid(targetAccountSid, "AC") || targetAuthToken.length < 20 || targetAuthToken.length > 128) return fail();
 const parentAccountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
 if (!isSid(parentAccountSid ?? "", "AC")) return fail();
 let outcome = "failed";
 try {
  const parent = getParentTwilioHttpClient();
  const tenant = getSubaccountTwilioHttpClient(targetAccountSid, targetAuthToken);
  const [parentAccount, tenantAccount, brand, service, campaign, providerPhone, senderPool] = await Promise.all([
   parent.request<Account>(`https://api.twilio.com/2010-04-01/Accounts/${targetAccountSid}.json`, { method: "GET" }),
   tenant.request<Account>(`https://api.twilio.com/2010-04-01/Accounts/${targetAccountSid}.json`, { method: "GET" }),
   parent.request<Resource>(`https://messaging.twilio.com/v1/a2p/BrandRegistrations/${brandSid}`, { method: "GET" }),
   tenant.request<Resource>(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}`, { method: "GET" }),
   tenant.request<Resource>(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}/Compliance/Usa2p/${campaignSid}`, { method: "GET" }),
   tenant.request<Resource>(`https://api.twilio.com/2010-04-01/Accounts/${targetAccountSid}/IncomingPhoneNumbers/${phoneSid}.json`, { method: "GET" }),
   tenant.request<Resource>(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}/PhoneNumbers/${phoneSid}`, { method: "GET" }),
  ]);
  if (parentAccount.sid !== targetAccountSid || parentAccount.owner_account_sid !== parentAccountSid || parentAccount.status !== "active" || tenantAccount.sid !== targetAccountSid || tenantAccount.owner_account_sid !== parentAccountSid || tenantAccount.status !== "active" || brand.sid !== brandSid || brand.status?.toUpperCase() !== "APPROVED" || service.sid !== messagingServiceSid || service.account_sid !== targetAccountSid || campaign.sid !== campaignSid || campaign.account_sid !== targetAccountSid || campaign.messaging_service_sid !== messagingServiceSid || campaign.brand_registration_sid !== brandSid || campaign.campaign_status?.toUpperCase() !== "VERIFIED" || providerPhone.sid !== phoneSid || providerPhone.account_sid !== targetAccountSid || providerPhone.phone_number !== phone || senderPool.sid !== phoneSid || senderPool.account_sid !== targetAccountSid || senderPool.service_sid !== messagingServiceSid) return fail();

  const db = getSupabaseAdmin();
  if (!db) return fail();
  const [accountResult, activationResult, phoneResult, complianceResult] = await Promise.all([
   db.from("business_twilio_accounts").select("id").eq("business_id", businessId).maybeSingle(),
   db.from("twilio_tenant_activations").select("id").eq("business_id", businessId).maybeSingle(),
   db.from("twilio_phone_numbers").select("id").eq("business_id", businessId).eq("is_primary", true).eq("status", "active").maybeSingle(),
   db.from("twilio_compliance_registrations").select("id").eq("business_id", businessId).eq("registration_type", "secondary_customer_profile").maybeSingle(),
  ]);
  if (accountResult.error || activationResult.error || phoneResult.error || complianceResult.error || !accountResult.data || !activationResult.data || !phoneResult.data || !complianceResult.data) return fail();
  const accountId = accountResult.data.id;
  const now = new Date().toISOString();
  const accountUpdate = await db.from("business_twilio_accounts").update({ twilio_subaccount_sid: targetAccountSid, twilio_subaccount_status: "active", provisioning_status: "active", provisioning_error: null, last_synced_at: now, updated_at: now }).eq("id", accountId).eq("business_id", businessId);
  if (accountUpdate.error) return fail();
  const vault = await getSubaccountWebhookSecretResolver().storeSubaccountAuthToken({ businessId, subaccountSid: targetAccountSid, authToken: targetAuthToken });
  if (vault.status !== "available") return fail();
  const [activationUpdate, phoneUpdate, complianceUpdate] = await Promise.all([
   db.from("twilio_tenant_activations").update({ business_twilio_account_id: accountId, brand_registration_sid: brandSid, campaign_sid: campaignSid, messaging_service_sid: messagingServiceSid, phone_number_sid: phoneSid, last_error_category: null, updated_at: now }).eq("id", activationResult.data.id).eq("business_id", businessId),
   db.from("twilio_phone_numbers").update({ business_twilio_account_id: accountId, twilio_phone_number_sid: phoneSid, phone_number_e164: phone, messaging_service_sid: messagingServiceSid, status: "active", provisioning_status: "active", provisioning_error: null, last_synced_at: now, updated_at: now }).eq("id", phoneResult.data.id).eq("business_id", businessId),
   db.from("twilio_compliance_registrations").update({ business_twilio_account_id: accountId, twilio_brand_sid: brandSid, updated_at: now }).eq("id", complianceResult.data.id).eq("business_id", businessId),
  ]);
  if (activationUpdate.error || phoneUpdate.error || complianceUpdate.error) return fail();
  const readiness = await verifyTenantReadiness(businessId);
  outcome = readiness.state;
 } catch {
  outcome = "failed";
 }
 redirect(`/app/admin/twilio?relink=${outcome}`);
}
