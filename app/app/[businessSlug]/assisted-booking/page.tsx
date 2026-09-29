import {WorkspaceNav} from "../WorkspaceNav";
import {requireWorkspaceCapability} from "@/lib/workspace";
import {resolveCurrentSmsConsent,webBookingSmsConsentDisclosure} from "@/lib/smsConsent";
import {AssistedRentalBookingForm} from "@/components/AssistedRentalBookingForm";
export default async function AssistedBooking({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,{supabase,business}=await requireWorkspaceCapability(businessSlug,"job_management");
 const [{data:customers},{data:items,error:itemsError},{data:consents},{data:settings}]=await Promise.all([
  supabase.from("customers").select("id,first_name,last_name,email,phone,phone_normalized,sms_consent_status").eq("business_id",business.id).eq("is_deleted",false).order("last_name").limit(100),
  supabase.from("inventory_items").select("id,name,daily_price_cents,allow_quantity,stock_quantity").eq("business_id",business.id).eq("active",true).order("name"),
  supabase.from("customer_sms_consents").select("phone_e164,status").eq("business_id",business.id),
  supabase.from("booking_settings").select("rental_deposit_percent").eq("business_id",business.id).maybeSingle(),
 ]);
 const consentByPhone=new Map((consents??[]).map(row=>[row.phone_e164,row.status]));
 const options=(customers??[]).map(c=>{const sms=resolveCurrentSmsConsent({phone:c.phone_normalized,customerStatus:c.sms_consent_status,ledgerStatus:consentByPhone.get(c.phone_normalized??"")});return {id:c.id,label:`${c.first_name} ${c.last_name} · ${c.phone||c.email} · SMS ${sms.display}`};});
 const percent=Number(settings?.rental_deposit_percent??25);
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><header className="epic3-header"><div><h1>New Booking</h1><p>Confirm final amounts before sending the customer’s secure deposit link.</p></div></header>{itemsError?<p role="alert">Rental inventory could not be loaded. Please refresh.</p>:<AssistedRentalBookingForm slug={businessSlug} items={items??[]} customers={options} disclosure={webBookingSmsConsentDisclosure(business.name)} requestKey={crypto.randomUUID()} depositPercent={Number.isFinite(percent)?Math.min(100,Math.max(0,percent)):25}/>}</section></main>;
}
