type VerificationRecord={type:string;domain:string;value:string;reason?:string};
type RecommendedRecord={type:string;rank?:number;value:string};

export type VercelDomainStatus={
 configured:boolean;verified:boolean;misconfigured:boolean;error?:string;
 verification:VerificationRecord[];dnsRecords:{type:string;name:string;value:string}[];
};

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

export async function addVercelProjectDomain(domain:string){
 const {token,project,team}=configuration();
 if(!token||!project)throw new Error("Servonas custom-domain management is not configured.");
 const response=await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/domains${query(team)}`,{method:"POST",headers:headers(token),body:JSON.stringify({name:domain}),cache:"no-store"});
 const body=await json(response);
 if(!response.ok&&body?.error?.code!=="domain_already_in_project")throw new Error(message(body,"Vercel could not add this domain."));
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
 const recommended=(Array.isArray(configBody?.recommendedCNAME)?configBody.recommendedCNAME:Array.isArray(configBody?.recommendedIPv4)?configBody.recommendedIPv4:[]) as RecommendedRecord[];
 const isSubdomain=domain.split(".").length>2;
 const dnsRecords=recommended.length?recommended.map(record=>({type:isSubdomain?"CNAME":"A",name:isSubdomain?domain.split(".")[0]:"@",value:record.value})):[{type:isSubdomain?"CNAME":"A",name:isSubdomain?domain.split(".")[0]:"@",value:isSubdomain?"cname.vercel-dns.com":"76.76.21.21"}];
 return {configured:true,verified:Boolean(projectBody.verified),misconfigured:configResponse.ok?Boolean(configBody.misconfigured):true,verification:Array.isArray(projectBody.verification)?projectBody.verification:[],dnsRecords};
}
