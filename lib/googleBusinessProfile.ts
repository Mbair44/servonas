import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

type TokenResponse={access_token?:string;refresh_token?:string;expires_in?:number;token_type?:string;scope?:string;error?:string;error_description?:string};
type GoogleLocation={name?:string;title?:string};
type GoogleApiErrorPayload={error?:{message?:string;status?:string}};
type GoogleBusinessAccountsResponse={accounts?:{name?:string}[]};
type GoogleBusinessLocationsResponse={locations?:GoogleLocation[]};
type GoogleBusinessConnectionStatus="connected"|"reauthorization_required"|"oauth_connected"|"account_discovery_pending"|"account_discovery_rate_limited";
type GoogleBusinessRequestContext={googleBusinessOperationId:string;stage:string;businessId:string;accountId?:string|null;locationId?:string|null;retryAttempt?:number;requestCounter?:{current:number}};
type GoogleBusinessDiscoveryContext={googleBusinessOperationId:string;businessId:string;actorUserId:string;stage:string;force?:boolean;businessName:string};
type GoogleBusinessDiscoveryCacheEntry={expiresAt:number;result:GoogleBusinessDiscoveryResult};
type GoogleBusinessDiscoveryPersistInput={businessId:string;connectedBy:string;refreshToken:string;status:GoogleBusinessConnectionStatus;googleAccountId?:string|null;googleLocationId?:string|null;locationTitle?:string|null;lastDiscoveryAttemptAt?:string|null;lastDiscoverySuccessAt?:string|null;retryAfterAt?:string|null;lastDiscoveryErrorCode?:string|null;lastDiscoveryErrorMessage?:string|null;discoveryRetryAttemptCount?:number;discoveryOperationId?:string|null;};
export type GoogleBusinessPersistenceMetadata={persistenceType:"supabase";tableName:"business_google_profile_connections";endpointPath:"/rest/v1/business_google_profile_connections";method:"GET"|"POST";operation:"select"|"upsert";conflictKey:"business_id";httpStatus:number|null;databaseErrorCode:string|null;safeErrorMessage:string;};

export class GoogleBusinessTokenExchangeError extends Error {
 constructor(message:string,readonly httpStatus:number,readonly googleErrorCode:string|null){super(message);this.name="GoogleBusinessTokenExchangeError";}
}

export class GoogleBusinessApiError extends Error {
 constructor(message:string,readonly httpStatus:number,readonly service:string,readonly endpoint:string,readonly retryAfter:string|null,readonly googleStatus:string|null){super(message);this.name="GoogleBusinessApiError";}
}

export class GoogleBusinessPersistenceError extends Error {
 constructor(message:string,readonly metadata:GoogleBusinessPersistenceMetadata){super(message);this.name="GoogleBusinessPersistenceError";}
}

export type GoogleProfileReview={reviewId:string;author:string;authorUri:string|null;rating:number;text:string;publishedAt:string|null;reply:string|null;replyUpdatedAt:string|null};
export type GoogleProfileReviews={rating:number;reviewCount:number;reviews:GoogleProfileReview[]};
export type GoogleBusinessLocationMatch={accountId:string;locationId:string;title:string};
export type GoogleBusinessDiscoveryResult={status:GoogleBusinessConnectionStatus;location:GoogleBusinessLocationMatch|null;locations:GoogleBusinessLocationMatch[];rateLimited:boolean;retryAfter:string|null;userMessage:string;duplicateAccountRequests:number;accountManagementCalls:number;businessInformationCalls:number;retries:number;};
export type GoogleBusinessRediscoveryResult={ok:boolean;status:GoogleBusinessConnectionStatus;rateLimited:boolean;retryAfter:string|null;userMessage:string;locationTitle:string|null;locationCount:number;};

const credentials=()=>({clientId:process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim(),clientSecret:process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim()});
export const googleBusinessRedirectUri=()=>`${(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||"https://servonas.com").replace(/\/$/,"")}/api/google-business/callback`;
const discoveryCacheTtlMs=5*60_000;
const discoveryCache=new Map<string,GoogleBusinessDiscoveryCacheEntry>();
const discoveryInflight=new Map<string,Promise<GoogleBusinessDiscoveryResult>>();

function log(event:string,details:Record<string,unknown>={}){console.info(event,{provider:"google_business_profile",...details});}
function clean(value:string|null|undefined,max=200){const next=value?.trim();return next?next.slice(0,max):"";}
const nextDiscoveryRetryAt=(attempt:number,retryAfter:string|null)=>retryAfter??new Date(Date.now()+Math.min(60*60_000,(30_000*2**Math.max(0,attempt-1))+Math.floor(Math.random()*10_000))).toISOString();
function parseRetryAfter(header:string|null){const value=clean(header,120);if(!value)return null;const seconds=Number(value);if(Number.isFinite(seconds)&&seconds>=0)return new Date(Date.now()+seconds*1000).toISOString();const date=Date.parse(value);return Number.isNaN(date)?null:new Date(date).toISOString();}
function discoveryKey(input:{businessId:string;actorUserId:string}){return `${input.businessId}:${input.actorUserId}`;}
const persistenceResourceName="business_google_profile_connections" as const;
const persistenceEndpointPath="/rest/v1/business_google_profile_connections" as const;
const persistenceMethod="POST" as const;
const persistenceOperation="upsert" as const;
const persistenceConflictKey="business_id" as const;
const persistenceType="supabase" as const;
const databaseErrorCode=(error:unknown)=>{
 const value=error as {code?:unknown;message?:unknown;details?:unknown;hint?:unknown;name?:unknown;status?:unknown}|null;
 if(typeof value?.code==="string"&&value.code.trim())return value.code;
 const message=[value?.message,value?.details,value?.hint,value?.name].filter((part):part is string=>typeof part==="string"&&part.length>0).join(" ");
 return message.match(/\b(42P01|23502|23503|23505|42703|PGRST\d+)\b/i)?.[1]??null;
};
const safePersistenceMessage=(error:unknown)=>{
 const code=databaseErrorCode(error);
 if(code==="42P01"||code==="PGRST205")return "Google Business credential storage is not installed in this database yet.";
 if(code==="42703"||code==="PGRST204")return "Google Business credential storage is missing a required schema update.";
 if(code==="23502")return "Google Business credential storage is missing the nullable account-discovery schema update.";
 return error instanceof Error&&error.message?error.message:"Google Business credential persistence failed.";
};
const persistenceStatus=(error:unknown)=>{
 const value=error as {status?:unknown;code?:unknown}|null;
 if(typeof value?.status==="number")return value.status;
 if(typeof value?.status==="string"&&/^\d{3}$/.test(value.status))return Number(value.status);
 if(typeof value?.code==="string"){
  const match=value.code.match(/\b(\d{3})\b/);
  if(match)return Number(match[1]);
 }
 return null;
};

async function tokenRequest(params:URLSearchParams){
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params,cache:"no-store"});
 const result=await response.json() as TokenResponse;if(!response.ok||!result.access_token)throw new GoogleBusinessTokenExchangeError(result.error_description||result.error||"Google authorization failed.",response.status,result.error||null);return result;
}
export async function exchangeGoogleBusinessCode(code:string){const {clientId,clientSecret}=credentials();if(!clientId||!clientSecret)throw new Error("Google Business OAuth is not configured.");return tokenRequest(new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:googleBusinessRedirectUri(),grant_type:"authorization_code"}));}
async function refreshAccessToken(refreshToken:string){const {clientId,clientSecret}=credentials();if(!clientId||!clientSecret)throw new Error("Google Business OAuth is not configured.");return (await tokenRequest(new URLSearchParams({refresh_token:refreshToken,client_id:clientId,client_secret:clientSecret,grant_type:"refresh_token"}))).access_token!;}

async function googleRequest<T>(input:{url:string;accessToken:string;method?:string;service:string;endpoint:string;body?:string;context:GoogleBusinessRequestContext}){
 const requestCounter=input.context.requestCounter;
 const sequenceNumber=requestCounter?(requestCounter.current=(requestCounter.current??0)+1):1;
 const startedAt=Date.now();
 log("google_business_api_request_started",{googleBusinessOperationId:input.context.googleBusinessOperationId,stage:input.context.stage,service:input.service,endpoint:input.endpoint,method:input.method??"GET",businessId:input.context.businessId,accountId:input.context.accountId??null,locationId:input.context.locationId??null,requestSequenceNumber:sequenceNumber,retryAttempt:input.context.retryAttempt??0});
 const response=await fetch(input.url,{method:input.method??"GET",headers:{Authorization:`Bearer ${input.accessToken}`,...(input.body?{"Content-Type":"application/json"}:{})},body:input.body,cache:"no-store"});
 const durationMs=Date.now()-startedAt;
 const payload=await response.json().catch(()=>null) as (T&GoogleApiErrorPayload)|null;
 if(response.status===429){
  const retryAfter=parseRetryAfter(response.headers.get("retry-after"));
  log("google_business_api_rate_limited",{googleBusinessOperationId:input.context.googleBusinessOperationId,stage:input.context.stage,service:input.service,endpoint:input.endpoint,httpStatus:429,retryAfter,retryAttempt:input.context.retryAttempt??0,businessId:input.context.businessId,accountId:input.context.accountId??null,locationId:input.context.locationId??null,requestSequenceNumber:sequenceNumber,durationMs});
  throw new GoogleBusinessApiError(payload?.error?.message||"Google Business Profile rate limited the request.",429,input.service,input.endpoint,retryAfter,payload?.error?.status??null);
 }
 if(!response.ok)throw new GoogleBusinessApiError(payload?.error?.message||`Google Business Profile HTTP ${response.status}`,response.status,input.service,input.endpoint,parseRetryAfter(response.headers.get("retry-after")),payload?.error?.status??null);
 log("google_business_api_request_completed",{googleBusinessOperationId:input.context.googleBusinessOperationId,stage:input.context.stage,service:input.service,endpoint:input.endpoint,method:input.method??"GET",businessId:input.context.businessId,accountId:input.context.accountId??null,locationId:input.context.locationId??null,requestSequenceNumber:sequenceNumber,retryAttempt:input.context.retryAttempt??0,responseStatus:response.status,durationMs});
 return payload as T;
}

export async function persistGoogleBusinessConnection(input:GoogleBusinessDiscoveryPersistInput){
 const db=getSupabaseAdmin();if(!db)throw new Error("Google connection storage is unavailable.");
 const now=new Date().toISOString();
 const {error}=await db.from("business_google_profile_connections").upsert({business_id:input.businessId,connected_by:input.connectedBy,refresh_token:input.refreshToken,google_account_id:input.googleAccountId,google_location_id:input.googleLocationId,location_title:input.locationTitle,status:input.status,connected_at:now,updated_at:now,last_discovery_attempt_at:input.lastDiscoveryAttemptAt??null,last_discovery_success_at:input.lastDiscoverySuccessAt??null,retry_after_at:input.retryAfterAt??null,last_discovery_error_code:input.lastDiscoveryErrorCode??null,last_discovery_error_message:input.lastDiscoveryErrorMessage??null,discovery_retry_attempt_count:input.discoveryRetryAttemptCount??0,discovery_operation_id:input.discoveryOperationId??null},{onConflict:"business_id"});
 if(error)throw new GoogleBusinessPersistenceError(safePersistenceMessage(error),{persistenceType,tableName:persistenceResourceName,endpointPath:persistenceEndpointPath,method:persistenceMethod,operation:persistenceOperation,conflictKey:persistenceConflictKey,httpStatus:persistenceStatus(error),databaseErrorCode:databaseErrorCode(error),safeErrorMessage:safePersistenceMessage(error)});
}

export async function refreshGoogleBusinessAccessToken(refreshToken:string){
 return refreshAccessToken(refreshToken);
}

async function listGoogleBusinessLocationsUncached(accessToken:string,context:GoogleBusinessDiscoveryContext){
 const requestCounter={current:0};
 let duplicateAccountRequests=0;
 let accountManagementCalls=0;
 let businessInformationCalls=0;
 const retries=0;
 accountManagementCalls+=1;
 const accounts=await googleRequest<GoogleBusinessAccountsResponse>({url:"https://mybusinessaccountmanagement.googleapis.com/v1/accounts",accessToken,service:"mybusinessaccountmanagement.googleapis.com",endpoint:"/v1/accounts",context:{googleBusinessOperationId:context.googleBusinessOperationId,stage:context.stage,businessId:context.businessId,retryAttempt:0,requestCounter}});
 for(const account of accounts.accounts??[]){if(account.name==="/accounts")duplicateAccountRequests+=1;}
 const locations:GoogleBusinessLocationMatch[]=[];
 for(const account of accounts.accounts??[]){
  if(!account.name)continue;
  const accountId=account.name.split("/").pop()||null;
  businessInformationCalls+=1;
  const result=await googleRequest<GoogleBusinessLocationsResponse>({url:`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title&pageSize=100`,accessToken,service:"mybusinessbusinessinformation.googleapis.com",endpoint:`/v1/${account.name}/locations`,context:{googleBusinessOperationId:context.googleBusinessOperationId,stage:context.stage,businessId:context.businessId,accountId,retryAttempt:0,requestCounter}});
  for(const location of result.locations??[]){const locationId=location.name?.split("/").pop();if(locationId&&accountId)locations.push({accountId,locationId,title:location.title||"Google Business Profile"});}
 }
 return {locations,duplicateAccountRequests,accountManagementCalls,businessInformationCalls,retries};
}

export async function discoverGoogleBusinessLocations(accessToken:string,input:GoogleBusinessDiscoveryContext):Promise<GoogleBusinessDiscoveryResult>{
 const key=discoveryKey(input);
 const cached=discoveryCache.get(key);
 if(!input.force&&cached&&cached.expiresAt>Date.now()){
  log("google_business_discovery_deferred",{googleBusinessOperationId:input.googleBusinessOperationId,businessId:input.businessId,stage:input.stage,reason:"cached_discovery_valid",cacheTtlMs:Math.max(0,cached.expiresAt-Date.now())});
  return cached.result;
 }
 const running=discoveryInflight.get(key);
 if(!input.force&&running){
  log("google_business_discovery_deferred",{googleBusinessOperationId:input.googleBusinessOperationId,businessId:input.businessId,stage:input.stage,reason:"inflight_reused"});
  return running;
 }
 const work=(async()=>{
  try{
   const listed=await listGoogleBusinessLocationsUncached(accessToken,input);
   const wanted=input.businessName.trim().toLowerCase();
   const matches=listed.locations.filter((location)=>location.title.trim().toLowerCase()===wanted);
   const location=matches.length===1?matches[0]:listed.locations.length===1?listed.locations[0]:null;
   const result:GoogleBusinessDiscoveryResult={status:location?"connected":"account_discovery_pending",location,locations:listed.locations,rateLimited:false,retryAfter:null,userMessage:location?`Google Business Profile connected: ${location.title}`:listed.locations.length?"Google Business is connected, but Servonas needs a later discovery step to choose the right profile.":"Google Business is connected, but no Google Business Profile was found yet.",duplicateAccountRequests:listed.duplicateAccountRequests,accountManagementCalls:listed.accountManagementCalls,businessInformationCalls:listed.businessInformationCalls,retries:listed.retries};
   discoveryCache.set(key,{expiresAt:Date.now()+discoveryCacheTtlMs,result});
   return result;
  }catch(error){
   if(error instanceof GoogleBusinessApiError&&error.httpStatus===429){
    const result:GoogleBusinessDiscoveryResult={status:"account_discovery_rate_limited",location:null,locations:[],rateLimited:true,retryAfter:error.retryAfter,userMessage:"Google Business connected, but Google temporarily limited account lookup. Try again shortly without reconnecting.",duplicateAccountRequests:0,accountManagementCalls:1,businessInformationCalls:0,retries:0};
    discoveryCache.set(key,{expiresAt:Date.now()+Math.min(discoveryCacheTtlMs,60_000),result});
    log("google_business_retry_scheduled",{googleBusinessOperationId:input.googleBusinessOperationId,businessId:input.businessId,stage:input.stage,service:error.service,endpoint:error.endpoint,httpStatus:error.httpStatus,retryAfter:error.retryAfter,retryAttempt:0});
    return result;
   }
   throw error;
  }finally{
   discoveryInflight.delete(key);
  }
 })();
 discoveryInflight.set(key,work);
 return work;
}

export async function retryGoogleBusinessLocationDiscovery(input:{businessId:string;businessName:string;actorUserId:string;connectedBy:string;googleBusinessOperationId:string;force?:boolean;}):Promise<GoogleBusinessRediscoveryResult>{
 const db=getSupabaseAdmin();if(!db)throw new Error("Google connection storage is unavailable.");
 const {data:connection,error}=await db.from("business_google_profile_connections").select("refresh_token,status,retry_after_at,last_discovery_attempt_at,discovery_retry_attempt_count").eq("business_id",input.businessId).maybeSingle();
 if(error)throw new GoogleBusinessPersistenceError(safePersistenceMessage(error),{persistenceType,tableName:persistenceResourceName,endpointPath:persistenceEndpointPath,method:"GET",operation:"select",conflictKey:persistenceConflictKey,httpStatus:persistenceStatus(error),databaseErrorCode:databaseErrorCode(error),safeErrorMessage:safePersistenceMessage(error)});
 if(!connection?.refresh_token)throw new Error("Reconnect Google Business Profile before retrying account discovery.");
 const retryAfterAt=typeof connection.retry_after_at==="string"?connection.retry_after_at:null;
 if(!input.force&&retryAfterAt&&new Date(retryAfterAt).getTime()>Date.now()){log("google_business_account_discovery_skipped_due_to_backoff",{businessId:input.businessId,stage:"account_discovery_retry",attempt:connection.discovery_retry_attempt_count??0,lastAttemptAt:connection.last_discovery_attempt_at??null,nextRetryAt:retryAfterAt,httpStatus:429,retryAfter:retryAfterAt,operationId:input.googleBusinessOperationId});return{ok:false,status:connection.status??"account_discovery_rate_limited",rateLimited:true,retryAfter:retryAfterAt,userMessage:"Google is temporarily limiting requests. Your account is still connected. We’ll retry automatically.",locationTitle:null,locationCount:0};}
 const accessToken=await refreshAccessToken(connection.refresh_token);
 const discovery=await discoverGoogleBusinessLocations(accessToken,{googleBusinessOperationId:input.googleBusinessOperationId,businessId:input.businessId,actorUserId:input.actorUserId,stage:"account_discovery_retry",businessName:input.businessName,force:input.force});
 const now=new Date().toISOString();
 if(discovery.rateLimited){
  const attempt=Number(connection.discovery_retry_attempt_count??0)+1,nextRetryAt=nextDiscoveryRetryAt(attempt,discovery.retryAfter);
  await persistGoogleBusinessConnection({businessId:input.businessId,connectedBy:input.connectedBy,refreshToken:connection.refresh_token,status:"account_discovery_rate_limited",lastDiscoveryAttemptAt:now,retryAfterAt:nextRetryAt,lastDiscoveryErrorCode:"rate_limited",lastDiscoveryErrorMessage:"Google is temporarily limiting requests. Your account is still connected. We’ll retry automatically.",discoveryRetryAttemptCount:attempt,discoveryOperationId:input.googleBusinessOperationId});
  log("google_business_account_discovery_rate_limited",{businessId:input.businessId,stage:"account_discovery_retry",attempt,lastAttemptAt:now,nextRetryAt,httpStatus:429,retryAfter:discovery.retryAfter,operationId:input.googleBusinessOperationId});
  return{ok:false,status:"account_discovery_rate_limited",rateLimited:true,retryAfter:nextRetryAt,userMessage:"Google is temporarily limiting requests. Your account is still connected. We’ll retry automatically.",locationTitle:null,locationCount:discovery.locations.length};
 }
 if(!discovery.location){
  await persistGoogleBusinessConnection({businessId:input.businessId,connectedBy:input.connectedBy,refreshToken:connection.refresh_token,status:"account_discovery_pending",lastDiscoveryAttemptAt:now,retryAfterAt:null,lastDiscoveryErrorCode:"location_selection_pending",lastDiscoveryErrorMessage:discovery.userMessage});
  return{ok:false,status:"account_discovery_pending",rateLimited:false,retryAfter:null,userMessage:discovery.userMessage,locationTitle:null,locationCount:discovery.locations.length};
 }
 await persistGoogleBusinessConnection({businessId:input.businessId,connectedBy:input.connectedBy,refreshToken:connection.refresh_token,status:"connected",googleAccountId:discovery.location.accountId,googleLocationId:discovery.location.locationId,locationTitle:discovery.location.title,lastDiscoveryAttemptAt:now,lastDiscoverySuccessAt:now,retryAfterAt:null,lastDiscoveryErrorCode:null,lastDiscoveryErrorMessage:null,discoveryRetryAttemptCount:0,discoveryOperationId:input.googleBusinessOperationId});
 return{ok:true,status:"connected",rateLimited:false,retryAfter:null,userMessage:`Google Business Profile connected: ${discovery.location.title}`,locationTitle:discovery.location.title,locationCount:discovery.locations.length};
}

const stars:Record<string,number>={ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5};
export async function getGoogleBusinessProfileReviews(businessId:string):Promise<GoogleProfileReviews|null>{
 const db=getSupabaseAdmin();if(!db)return null;const {data:connection}=await db.from("business_google_profile_connections").select("refresh_token,google_account_id,google_location_id,status").eq("business_id",businessId).maybeSingle();if(!connection||connection.status!=="connected"||!connection.google_account_id||!connection.google_location_id)return null;
 try{const accessToken=await refreshAccessToken(connection.refresh_token),result=await googleRequest<{averageRating?:number;totalReviewCount?:number;reviews?:{reviewId?:string;reviewer?:{displayName?:string;profilePhotoUrl?:string};starRating?:string;comment?:string;createTime?:string;reviewReply?:{comment?:string;updateTime?:string}}[]}>({url:`https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(connection.google_account_id)}/locations/${encodeURIComponent(connection.google_location_id)}/reviews?pageSize=50&orderBy=updateTime%20desc`,accessToken,service:"mybusiness.googleapis.com",endpoint:`/v4/accounts/${encodeURIComponent(connection.google_account_id)}/locations/${encodeURIComponent(connection.google_location_id)}/reviews`,context:{googleBusinessOperationId:`gbr-${businessId}`,stage:"review_sync",businessId,accountId:connection.google_account_id,locationId:connection.google_location_id,retryAttempt:0,requestCounter:{current:0}}});return {rating:Number(result.averageRating||0),reviewCount:Number(result.totalReviewCount||0),reviews:(result.reviews??[]).map(review=>({reviewId:review.reviewId||"",author:review.reviewer?.displayName||"Google user",authorUri:null,rating:stars[review.starRating||""]||0,text:review.comment||"",publishedAt:review.createTime||null,reply:review.reviewReply?.comment||null,replyUpdatedAt:review.reviewReply?.updateTime||null})).filter(review=>review.rating>0&&review.text&&review.reviewId)};}catch(error){console.error("Google Business Profile review sync failed",{businessId,message:error instanceof Error?error.message:"unknown"});return null;}
}

export async function postGoogleBusinessProfileReviewReply(input:{businessId:string;reviewId:string;reply:string}){
 const db=getSupabaseAdmin();if(!db)throw new Error("Google Business Profile is unavailable.");
 const {data:connection}=await db.from("business_google_profile_connections").select("refresh_token,google_account_id,google_location_id,status").eq("business_id",input.businessId).maybeSingle();
 if(!connection||connection.status!=="connected"||!connection.google_account_id||!connection.google_location_id)throw new Error("Connect Google Business Profile before posting a reply.");
 const accessToken=await refreshAccessToken(connection.refresh_token),url=`https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(connection.google_account_id)}/locations/${encodeURIComponent(connection.google_location_id)}/reviews/${encodeURIComponent(input.reviewId)}/reply`;
 await googleRequest<unknown>({url,method:"PUT",body:JSON.stringify({comment:input.reply}),accessToken,service:"mybusiness.googleapis.com",endpoint:`/v4/accounts/${encodeURIComponent(connection.google_account_id)}/locations/${encodeURIComponent(connection.google_location_id)}/reviews/${encodeURIComponent(input.reviewId)}/reply`,context:{googleBusinessOperationId:`gbr-${input.businessId}`,stage:"review_reply",businessId:input.businessId,accountId:connection.google_account_id,locationId:connection.google_location_id,retryAttempt:0,requestCounter:{current:0}}});
}

export async function generateGoogleBusinessReviewReply(input:{businessName:string;author:string;rating:number;review:string}){
 const apiKey=process.env.OPENAI_API_KEY?.trim();if(!apiKey)throw new Error("AI review replies are not configured.");
 const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_ASSISTANT_MODEL?.trim()||"gpt-4.1-mini",temperature:.35,messages:[{role:"system",content:"Write one concise, natural Google Business Profile review reply for a small business. Use only the review facts. Thank positive reviewers specifically without repeating their review. For a negative review, acknowledge the concern professionally, do not argue or admit liability, and invite an offline resolution. Never invent details. Return only the reply."},{role:"user",content:JSON.stringify(input)}]})});
 const payload=await response.json().catch(()=>null) as {choices?:{message?:{content?:string}}[];error?:{message?:string}}|null,reply=payload?.choices?.[0]?.message?.content?.trim();if(!response.ok||!reply)throw new Error(payload?.error?.message||"Servonas could not generate a reply.");return reply.slice(0,1500);
}
