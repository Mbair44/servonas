import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {normalizeWebsiteDomain} from "@/lib/website";
import {getVercelDomainQuote,vercelRegistrarConfigured,vercelStandardDomainMaximumPrice} from "@/lib/vercelDomains";

export async function POST(request:Request){
 const supabase=await createSupabaseServerClient(),{data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Sign in to check a domain."},{status:401});
 let requested="";
 try{requested=String((await request.json())?.domain??"");}catch{return NextResponse.json({error:"Enter a valid domain, such as yourbusiness.com."},{status:400});}
 const domain=normalizeWebsiteDomain(requested);
 if(!domain)return NextResponse.json({error:"Enter a valid domain, such as yourbusiness.com."},{status:400});
 if(!vercelRegistrarConfigured())return NextResponse.json({error:"Domain availability is temporarily unavailable."},{status:503});
 try{
  const quote=await getVercelDomainQuote(domain),premium=quote.purchasePrice>vercelStandardDomainMaximumPrice();
  return NextResponse.json({domain:quote.domain,available:quote.available,premium,purchasePrice:quote.purchasePrice,renewalPrice:quote.renewalPrice,currency:"USD",years:quote.years},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  console.error("Website onboarding domain check failed",{userId:user.id,category:error instanceof TypeError?"network":"provider"});
  return NextResponse.json({error:"We couldn't check that domain right now. Please try again."},{status:502});
 }
}
