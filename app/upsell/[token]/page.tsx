import {notFound} from "next/navigation";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {loadPublicSmartUpsellOffer} from "@/lib/smartUpsellOfferPage";
import {SmartUpsellOfferPage} from "@/components/SmartUpsellOfferPage";
export const dynamic="force-dynamic";
export default async function SmartUpsellPage({params}:{params:Promise<{token:string}>}){const {token}=await params,db=getSupabaseAdmin();const offer=db?await loadPublicSmartUpsellOffer(db,{token}):null;if(!offer)notFound();return <SmartUpsellOfferPage offer={offer}/>;}
