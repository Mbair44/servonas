import {normalizeWebsiteDomain} from "@/lib/website";

type TenantWebsiteSettings={
  custom_domain?:string|null;
  domain_status?:string|null;
  status?:string|null;
};

export type CheckoutReturnOrigin={origin:string;usesTenantDomain:boolean};

function normalizedOrigin(value:string|undefined|null,allowHttp=false){
  if(!value)return null;
  try{
    const url=new URL(value);
    if((url.protocol!=="https:"&&(!allowHttp||url.protocol!=="http:"))||url.username||url.password||url.pathname!=="/"||url.search||url.hash)return null;
    return url.origin;
  }catch{return null;}
}

/**
 * A checkout return URL may use a custom origin only after it has matched the
 * tenant's connected, published domain. Request Host is deliberately not an
 * input: it can be supplied by an untrusted client or proxy.
 */
export function resolveTenantCheckoutReturnOrigin({
  candidateOrigin,
  settings,
  platformOrigin,
}: {
  candidateOrigin:string|null;
  settings:TenantWebsiteSettings|null;
  platformOrigin:string;
}):CheckoutReturnOrigin{
  const fallback=normalizedOrigin(platformOrigin,true);
  if(!fallback)throw new Error("NEXT_PUBLIC_SITE_URL must be a valid origin.");
  const customDomain=settings?.status==="published"&&settings.domain_status==="connected"
    ?normalizeWebsiteDomain(String(settings.custom_domain??""))
    :null;
  const candidate=normalizedOrigin(candidateOrigin);
  const candidateHostname=candidate?new URL(candidate).hostname:null;
  const configuredHosts=customDomain?[customDomain,customDomain.startsWith("www.")?customDomain.slice(4):`www.${customDomain}`]:[];
  if(candidate&&candidateHostname&&configuredHosts.includes(candidateHostname))return {origin:candidate,usesTenantDomain:true};
  return {origin:fallback,usesTenantDomain:false};
}
