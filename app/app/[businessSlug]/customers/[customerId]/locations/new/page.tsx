import Link from "next/link";
import {notFound} from "next/navigation";
import ServiceLocationForm from "@/components/ServiceLocationForm";
import {canManageCustomers} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";
import {WorkspaceNav} from "../../../../WorkspaceNav";
import {saveServiceLocation} from "../../../actions";

export default async function NewLocation({params}:{params:Promise<{businessSlug:string;customerId:string}>}){
 const {businessSlug,customerId}=await params;
 const {supabase,business,role}=await requireWorkspace(businessSlug);
 if(!canManageCustomers(role))notFound();
 const {data:customer}=await supabase.from("customers").select("id,first_name,last_name,company_name").eq("id",customerId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle();
 if(!customer)notFound();
 const name=customer.company_name||[customer.first_name,customer.last_name].filter(Boolean).join(" ");
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content">
  <header className="epic3-header"><div><small>Service location</small><h1>Add location for {name}</h1></div><Link href={`/app/${businessSlug}/customers/${customerId}`}>Back to customer</Link></header>
  <section className="workspace-panel"><ServiceLocationForm action={saveServiceLocation.bind(null,businessSlug,customerId,null)} googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY?process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:undefined}/></section>
 </section></main>;
}
