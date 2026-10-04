import type Stripe from "stripe";
import {stripeClient} from "@/lib/stripeConnect";
import {stripeTaxCodeFallbackOptions,type StripeTaxCodeOption} from "@/lib/stripeTaxCodes";

const cacheDurationMs=6*60*60*1000;
let cached:{expiresAt:number;options:StripeTaxCodeOption[]}|null=null;

function normalizeTaxCodes(codes:Stripe.TaxCode[]):StripeTaxCodeOption[]{
 return codes.filter(code=>code.id.startsWith("txcd_")&&code.name&&code.description)
  .map(code=>({id:code.id,name:code.name,description:code.description}))
  .sort((left,right)=>left.name.localeCompare(right.name)||left.id.localeCompare(right.id));
}

/** Stripe's globally supported Tax Code taxonomy; it is not tied to a tenant account. */
export async function listStripeTaxCodeCatalog(client:Pick<Stripe,"taxCodes">=stripeClient()):Promise<StripeTaxCodeOption[]>{
 if(cached&&cached.expiresAt>Date.now())return cached.options;
 try{
  const codes=await client.taxCodes.list({limit:100}).autoPagingToArray({limit:1000});
  const options=normalizeTaxCodes(codes);
  if(options.length){cached={expiresAt:Date.now()+cacheDurationMs,options};return options;}
 }catch(error){
  console.warn("Stripe Tax Code catalog unavailable",{operation:"list_tax_codes",errorType:error instanceof Error?error.name:"unknown",errorMessage:error instanceof Error?error.message:"Unknown Stripe error"});
 }
 return stripeTaxCodeFallbackOptions;
}

export function clearStripeTaxCodeCatalogCacheForTests(){cached=null;}
