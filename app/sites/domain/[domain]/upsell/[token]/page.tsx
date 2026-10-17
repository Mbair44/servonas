import {notFound} from "next/navigation";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {loadPublicSmartUpsellOffer} from "@/lib/smartUpsellOfferPage";
import {SmartUpsellOfferPage} from "@/components/SmartUpsellOfferPage";
export const dynamic="force-dynamic";
export default async function DomainSmartUpsellPage({params}:{params:Promise<{domain:string;token:string}>}){const {domain,token}=await params,db=getSupabaseAdmin();const offer=db?await loadPublicSmartUpsellOffer(db,{token,domain:decodeURIComponent(domain)}):null;if(!offer)notFound();return <SmartUpsellOfferPage offer={offer}/>;}
