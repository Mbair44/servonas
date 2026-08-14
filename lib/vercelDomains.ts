type VerificationRecord={type:string;domain:string;value:string;reason?:string};
type RecommendedRecord={type:string;rank?:number;value:string};

export type VercelDomainStatus={
 configured:boolean;verified:boolean;misconfigured:boolean;error?:string;
 verification:VerificationRecord[];dnsRecords:{type:string;name:string;value:string}[];
};
export type VercelDomainQuote={domain:string;available:boolean;purchasePrice:number;renewalPrice:number;years:number};
export type VercelRegistrant={firstName:string;lastName:string;email:string;phone:string;address1:string;address2?:string;city:string;state:string;zip:string;country:string;companyName?:string};

const configuration=()=>({
 token:process.env.VERCEL_API_TOKEN?.trim(),
 project:process.env.VERCEL_PROJECT_ID?.trim()||process.env.VERCEL_PROJECT_NAME?.trim(),
 team:process.env.VERCEL_TEAM_ID?.trim(),
});
const query=(team?:string)=>team?`?teamId=${encodeURIComponent(team)}`:"";
const headers=(token:string)=>({Authorization:`Bearer ${token}`,"Content-Type":"application/json"});
const message=(body:any,fallback:string)=>typeof body?.error?.message==="string"?body.error.message:fallback;

async function json(response:Response){try{return await response.json();}catch{return {};}}

export function vercelDomainManagementConfigured(){const {token,project}=configuration();return Boolean(token&&project);}
export function vercelRegistrarConfigured(){return Boolean(configuration().token);}
export function vercelStandardDomainMaximumPrice(){const value=Number(process.env.VERCEL_STANDARD_DOMAIN_MAX_USD??25);return Number.isFinite(value)&&value>0?value:25;}
export const DOMAIN_RETAIL_MARKUP_BPS=1500;
export function domainRetailPrice(providerPrice:number){
 if(!Number.isFinite(providerPrice)||providerPrice<0)throw new Error("Invalid provider domain price.");
 const providerCents=Math.round(providerPrice*100);
 return Math.round(providerCents*(10_000+DOMAIN_RETAIL_MARKUP_BPS)/10_000)/100;
}

async function registrarRequest(path:string,init?:RequestInit){
 const {token,team}=configuration();if(!token)throw new Error("Servonas domain registration is not configured.");
 const separator=path.includes("?")?"&":"?",url=`https://api.vercel.com${path}${team?`${separator}teamId=${encodeURIComponent(team)}`:""}`;
 const response=await fetch(url,{...init,headers:{...headers(token),...(init?.headers??{})},cache:"no-store"}),body=await json(response);
 if(!response.ok)throw new Error(message(body,"Vercel could not complete the domain request."));
 return body;
}

export async function getVercelDomainQuote(domain:string):Promise<VercelDomainQuote>{
 const encoded=encodeURIComponent(domain),[availability,price]=await Promise.all([registrarRequest(`/v1/registrar/domains/${encoded}/availability`),registrarRequest(`/v1/registrar/domains/${encoded}/price?years=1`)]);
 const purchasePrice=Number(price.purchasePrice),renewalPrice=Number(price.renewalPrice),years=Number(price.years);
 if(typeof availability.available!=="boolean"||!Number.isFinite(purchasePrice)||purchasePrice<0||!Number.isFinite(renewalPrice)||renewalPrice<0||!Number.isInteger(years)||years<1)throw new Error("Vercel returned incomplete domain pricing.");
 return {domain,available:availability.available,purchasePrice,renewalPrice,years};
}

export async function buyVercelDomain(domain:string,expectedPrice:number,registrant:VercelRegistrant){
 const body=await registrarRequest("/v1/registrar/domains/buy",{method:"POST",body:JSON.stringify({domains:[{domainName:domain,autoRenew:true,years:1,expectedPrice}],contactInformation:registrant})});
 if(typeof body.orderId!=="string"||!body.orderId)throw new Error("Vercel did not return a domain order ID.");
 return {orderId:body.orderId};
}
export async function getVercelDomainOrder(orderId:string){
 const body=await registrarRequest(`/v1/registrar/orders/${encodeURIComponent(orderId)}`);
 if(!["draft","purchasing","completed","failed"].includes(body.status))throw new Error("Vercel returned an unknown domain order status.");
 return {orderId:String(body.orderId),status:body.status as "draft"|"purchasing"|"completed"|"failed"};
}

export async function addVercelProjectDomain(domain:string){
 const {token,project,team}=configuration();
 if(!token||!project)throw new Error("Servonas custom-domain management is not configured.");
 const response=await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/domains${query(team)}`,{method:"POST",headers:headers(token),body:JSON.stringify({name:domain}),cache:"no-store"});
 const body=await json(response);
 if(!response.ok&&body?.error?.code!=="domain_already_in_project"){
  // Vercel may return domain_already_in_use even when the domain is already
  // attached to this exact project. Confirm project ownership before treating
  // that response as a conflict with another project.
  if(body?.error?.code==="domain_already_in_use"){
   const existing=await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}${query(team)}`,{headers:headers(token),cache:"no-store"});
   if(existing.ok)return await json(existing);
  }
  throw new Error(message(body,"Vercel could not add this domain."));
 }
 return body;
}

export async function verifyVercelProjectDomain(domain:string){
 const {token,project,team}=configuration();
 if(!token||!project)throw new Error("Servonas custom-domain management is not configured.");
 const response=await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}/verify${query(team)}`,{method:"POST",headers:headers(token),cache:"no-store"});
 const body=await json(response);
 if(!response.ok)throw new Error(message(body,"Vercel could not verify this domain yet."));
 return body;
}

export async function getVercelDomainStatus(domain:string):Promise<VercelDomainStatus>{
 const {token,project,team}=configuration();
 if(!token||!project)return {configured:false,verified:false,misconfigured:true,verification:[],dnsRecords:[]};
 const suffix=query(team);
 const [projectResponse,configResponse]=await Promise.all([
  fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}${suffix}`,{headers:headers(token),cache:"no-store"}),
  fetch(`https://api.vercel.com/v6/domains/${encodeURIComponent(domain)}/config${suffix}`,{headers:headers(token),cache:"no-store"}),
 ]);
 const [projectBody,configBody]=await Promise.all([json(projectResponse),json(configResponse)]);
 if(!projectResponse.ok)return {configured:true,verified:false,misconfigured:true,error:message(projectBody,"Domain has not been added to Servonas hosting."),verification:[],dnsRecords:[]};
 const recommended=((Array.isArray(configBody?.recommendedCNAME)?configBody.recommendedCNAME:Array.isArray(configBody?.recommendedIPv4)?configBody.recommendedIPv4:[]) as RecommendedRecord[]).filter(record=>typeof record?.value==="string"&&record.value).sort((left,right)=>(left.rank??Number.MAX_SAFE_INTEGER)-(right.rank??Number.MAX_SAFE_INTEGER)).slice(0,1);
 const isSubdomain=domain.split(".").length>2;
 const dnsRecords=recommended.length?recommended.map(record=>({type:isSubdomain?"CNAME":"A",name:isSubdomain?domain.split(".")[0]:"@",value:record.value})):[{type:isSubdomain?"CNAME":"A",name:isSubdomain?domain.split(".")[0]:"@",value:isSubdomain?"cname.vercel-dns.com":"76.76.21.21"}];
 return {configured:true,verified:Boolean(projectBody.verified),misconfigured:configResponse.ok?Boolean(configBody.misconfigured):true,verification:Array.isArray(projectBody.verification)?projectBody.verification:[],dnsRecords};
}
