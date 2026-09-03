import {randomUUID} from "crypto";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {discoverGoogleBusinessLocations,exchangeGoogleBusinessCode,GoogleBusinessApiError,GoogleBusinessTokenExchangeError,googleBusinessRedirectUri,persistGoogleBusinessConnection} from "@/lib/googleBusinessProfile";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
import {canManageBusiness,managementAuthorizationSource} from "@/lib/access";
import {platformAdminRole} from "@/lib/platformAccess";

const appUrl=()=>process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com";
const destination=(slug:string,kind:"success"|"error",message:string)=>new URL(`/app/${encodeURIComponent(slug)}/settings/website?${kind}=${encodeURIComponent(message)}`,appUrl());
const log=(event:string,details:Record<string,unknown>={})=>console.info(event,{provider:"google_business_profile",...details});
type SavedState={state:string;businessSlug:string;businessId:string};

export async function GET(request:Request){
 const callbackId=`gbc-${randomUUID()}`,url=new URL(request.url),code=url.searchParams.get("code"),state=url.searchParams.get("state"),returnedScope=url.searchParams.get("scope"),oauthError=url.searchParams.get("error"),issuer=url.searchParams.get("iss"),requestId=request.headers.get("x-vercel-id")||request.headers.get("x-request-id")||null,requestHost=url.host,environment=process.env.VERCEL_ENV||process.env.NODE_ENV||"unknown";
 const redirect=(input:{stage:string;success:boolean;url:URL;businessId?:string|null;businessSlug?:string|null;userId?:string|null;errorCode?:string})=>{log("google_business_callback_redirected",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,stage:input.stage,success:input.success,redirectDestination:input.url.pathname,businessId:input.businessId??null,businessSlug:input.businessSlug??null,userId:input.userId??null,errorCode:input.errorCode??null});return NextResponse.redirect(input.url);};
 log("google_business_callback_started",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,hasState:Boolean(state),hasCode:Boolean(code),hasError:Boolean(oauthError),returnedScope,issuer,requestHost,environment});
 if(!state||!code||oauthError){
  const redirectDestination=destination("","error","Google authorization could not be verified."),errorCode=oauthError?"google_authorization_error":!state?"state_missing":"authorization_code_missing";
  log("google_business_callback_failed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,stage:"query_params",errorCode,safeMessage:"Google authorization could not be verified.",redirectDestination:redirectDestination.pathname});
  return redirect({stage:"query_params",success:false,url:redirectDestination,errorCode});
 }
 log("google_business_callback_params_validated",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,hasState:true,hasCode:true,returnedScope});
 const store=await cookies(),raw=store.get("servonas_google_business_oauth")?.value;store.delete("servonas_google_business_oauth");
 let saved:SavedState|null=null;try{saved=raw?JSON.parse(raw) as SavedState:null;}catch{/* invalid cookie remains unverified */}
 log("google_business_state_validation_started",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,hasStateCookie:Boolean(raw)});
 const stateFound=Boolean(saved),stateBusinessPresent=Boolean(saved?.businessId&&saved?.businessSlug),stateMatches=Boolean(saved&&state===saved.state);
 if(!saved||!stateBusinessPresent||!stateMatches){
  const errorCode=!saved?"state_not_found":!stateBusinessPresent?"state_business_missing":"state_mismatch",redirectDestination=destination(saved?.businessSlug||"","error","Google authorization could not be verified.");
  log("google_business_state_validation_completed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,stateFound,stateExpired:null,stateConsumed:null,businessId:saved?.businessId??null,businessSlug:saved?.businessSlug??null,userId:null,createdAt:null,expiresAt:null,validationPassed:false});
  log("google_business_callback_failed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,stage:"state_validation",errorCode,safeMessage:"Google authorization could not be verified.",redirectDestination:redirectDestination.pathname,businessId:saved?.businessId??null,businessSlug:saved?.businessSlug??null});
  return redirect({stage:"state_validation",success:false,url:redirectDestination,businessId:saved?.businessId??null,businessSlug:saved?.businessSlug??null,errorCode});
 }
 log("google_business_state_validation_completed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,stateFound:true,stateExpired:null,stateConsumed:null,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:null,createdAt:null,expiresAt:null,validationPassed:true});
 log("google_business_callback_workspace_resolution_started",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,businessSlug:saved.businessSlug});
 const supabase=await createSupabaseServerClient(),{data:{user}}=await supabase.auth.getUser(),platformAdminAccess=isServonasPlatformAdmin(user);
 const workspaceDb=platformAdminAccess?getSupabaseAdmin():supabase,{data:stateBusiness}=workspaceDb?await workspaceDb.from("businesses").select("id,owner_user_id").eq("id",saved.businessId).eq("slug",saved.businessSlug).eq("is_deleted",false).maybeSingle():{data:null};
 if(!stateBusiness){
  const redirectDestination=destination(saved.businessSlug,"error","Google authorization is not permitted for this workspace.");
  log("google_business_callback_workspace_resolution_completed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,userId:user?.id??null,businessId:saved.businessId,businessSlug:saved.businessSlug,authorized:false,platformAdminAccess,authorizationSource:"none"});
  log("google_business_callback_failed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,stage:"workspace_resolution",errorCode:"workspace_business_mismatch",safeMessage:"Google authorization is not permitted for this workspace.",redirectDestination:redirectDestination.pathname,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user?.id??null});
  return redirect({stage:"workspace_resolution",success:false,url:redirectDestination,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user?.id??null,errorCode:"workspace_business_mismatch"});
 }
 const {data:membership}=user?await supabase.from("business_members").select("role").eq("business_id",saved.businessId).eq("user_id",user.id).maybeSingle():{data:null};
 const role=platformAdminAccess?platformAdminRole:stateBusiness.owner_user_id===user?.id?"owner":membership?.role??null,authorized=Boolean(user&&canManageBusiness(role)),authorizationSource=user?managementAuthorizationSource(role,platformAdminAccess):"none";
 log("google_business_callback_workspace_resolution_completed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,userId:user?.id??null,businessId:saved.businessId,businessSlug:saved.businessSlug,authorized,platformAdminAccess,authorizationSource});
 if(!user||!authorized){
  const errorCode=!user?"missing_servonas_session":!membership?"workspace_membership_missing":"workspace_role_not_permitted",redirectDestination=destination(saved.businessSlug,"error","Google authorization is not permitted for this workspace.");
  log("google_business_callback_failed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,stage:"workspace_resolution",errorCode,safeMessage:"Google authorization is not permitted for this workspace.",redirectDestination:redirectDestination.pathname,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user?.id??null});
  return redirect({stage:"workspace_resolution",success:false,url:redirectDestination,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user?.id??null,errorCode});
 }
 const clientId=process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim(),clientSecret=process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim(),redirectUri=googleBusinessRedirectUri(),redirectUriUrl=new URL(redirectUri),configured=Boolean(clientId&&clientSecret&&redirectUri);
 log("google_business_oauth_config_validated",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,hasClientId:Boolean(clientId),hasClientSecret:Boolean(clientSecret),hasRedirectUri:Boolean(redirectUri),redirectUriHost:redirectUriUrl.host,redirectUriPath:redirectUriUrl.pathname});
 if(!configured){
  const errorCode="oauth_not_configured",redirectDestination=destination(saved.businessSlug,"error","Google Business OAuth is not configured.");
  log("google_business_callback_failed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,stage:"oauth_configuration",errorCode,safeMessage:"Google Business OAuth is not configured.",redirectDestination:redirectDestination.pathname,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user.id});
  return redirect({stage:"oauth_configuration",success:false,url:redirectDestination,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user.id,errorCode});
 }
 let stage="token_exchange";
 try{
  log("google_business_token_exchange_started",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user.id,redirectUriHost:redirectUriUrl.host,redirectUriPath:redirectUriUrl.pathname});
  const token=await exchangeGoogleBusinessCode(code);
  log("google_business_token_exchange_completed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,hasAccessToken:Boolean(token.access_token),hasRefreshToken:Boolean(token.refresh_token),expiresIn:token.expires_in??null,tokenType:token.token_type??null,returnedScope:token.scope??returnedScope});
  if(!token.refresh_token)throw new Error("Google did not provide long-term access. Remove Servonas from Google account permissions and connect again.");
  stage="credential_persistence";log("google_business_credentials_persist_started",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,hasRefreshToken:true,connectionStatus:"oauth_connected"});
  await persistGoogleBusinessConnection({businessId:saved.businessId,connectedBy:user.id,refreshToken:token.refresh_token,status:"oauth_connected"});
  log("google_business_credentials_persist_completed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,credentialRowId:saved.businessId,hasRefreshToken:true,connectionStatus:"oauth_connected"});
  stage="account_discovery";log("google_business_account_discovery_started",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,googleBusinessOperationId:callbackId});
  const db=getSupabaseAdmin();if(!db)throw new Error("Google connection storage is unavailable.");
  const {data:business}=await db.from("businesses").select("name").eq("id",saved.businessId).maybeSingle();
  const discovery=await discoverGoogleBusinessLocations(token.access_token!,{googleBusinessOperationId:callbackId,businessId:saved.businessId,actorUserId:user.id,stage:"account_discovery",businessName:business?.name??""});
  if(discovery.rateLimited){
   await persistGoogleBusinessConnection({businessId:saved.businessId,connectedBy:user.id,refreshToken:token.refresh_token,status:"account_discovery_rate_limited",lastDiscoveryAttemptAt:new Date().toISOString(),retryAfterAt:discovery.retryAfter,lastDiscoveryErrorCode:"rate_limited",lastDiscoveryErrorMessage:discovery.userMessage});
   log("google_business_account_discovery_deferred",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,googleBusinessOperationId:callbackId,status:"account_discovery_rate_limited",retryAfter:discovery.retryAfter,accountManagementCalls:discovery.accountManagementCalls,businessInformationCalls:discovery.businessInformationCalls});
   const redirectDestination=destination(saved.businessSlug,"success","Google Business connected, but Google temporarily limited account lookup. Try again shortly without reconnecting.");
   log("google_business_callback_completed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,businessSlug:saved.businessSlug,tokenExchangeCompleted:true,credentialsPersisted:true,accountDiscoveryCompleted:false,redirectDestination:redirectDestination.pathname});
   return redirect({stage:"account_discovery",success:true,url:redirectDestination,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user.id});
  }
  if(!discovery.location){
   await persistGoogleBusinessConnection({businessId:saved.businessId,connectedBy:user.id,refreshToken:token.refresh_token,status:"account_discovery_pending",lastDiscoveryAttemptAt:new Date().toISOString(),lastDiscoveryErrorCode:"location_selection_pending",lastDiscoveryErrorMessage:discovery.userMessage});
   log("google_business_account_discovery_deferred",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,googleBusinessOperationId:callbackId,status:"account_discovery_pending",locationCount:discovery.locations.length,accountManagementCalls:discovery.accountManagementCalls,businessInformationCalls:discovery.businessInformationCalls});
   const redirectDestination=destination(saved.businessSlug,"success","Google Business connected. Servonas saved the OAuth connection and will finish profile discovery next.");
   log("google_business_callback_completed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,businessSlug:saved.businessSlug,tokenExchangeCompleted:true,credentialsPersisted:true,accountDiscoveryCompleted:false,redirectDestination:redirectDestination.pathname});
   return redirect({stage:"account_discovery",success:true,url:redirectDestination,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user.id});
  }
  log("google_business_account_discovery_completed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,locationCount:discovery.locations.length,selectedLocationTitle:discovery.location.title,accountManagementCalls:discovery.accountManagementCalls,businessInformationCalls:discovery.businessInformationCalls,duplicateAccountRequests:discovery.duplicateAccountRequests,retries:discovery.retries});
  stage="credential_persistence";log("google_business_credentials_persist_started",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,hasRefreshToken:true,connectionStatus:"connected"});
  await persistGoogleBusinessConnection({businessId:saved.businessId,connectedBy:user.id,refreshToken:token.refresh_token,status:"connected",googleAccountId:discovery.location.accountId,googleLocationId:discovery.location.locationId,locationTitle:discovery.location.title,lastDiscoveryAttemptAt:new Date().toISOString(),lastDiscoverySuccessAt:new Date().toISOString(),retryAfterAt:null,lastDiscoveryErrorCode:null,lastDiscoveryErrorMessage:null});
  log("google_business_credentials_persist_completed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,credentialRowId:saved.businessId,hasRefreshToken:true,connectionStatus:"connected"});
  const redirectDestination=destination(saved.businessSlug,"success",`Google Business Profile connected: ${discovery.location.title}`);
  log("google_business_callback_completed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,businessSlug:saved.businessSlug,tokenExchangeCompleted:true,credentialsPersisted:true,accountDiscoveryCompleted:true,redirectDestination:redirectDestination.pathname});
  return redirect({stage:"success",success:true,url:redirectDestination,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user.id});
 }catch(error){
  const safeMessage=error instanceof Error?error.message:"Google Business Profile connection failed.",redirectDestination=destination(saved.businessSlug,"error",safeMessage),event=stage==="token_exchange"?"google_business_token_exchange_failed":stage==="account_discovery"?"google_business_account_discovery_failed":null;
  if(event)log(event,{googleBusinessCallbackId:callbackId,platformRequestId:requestId,businessId:saved.businessId,stage,httpStatus:error instanceof GoogleBusinessTokenExchangeError?error.httpStatus:null,googleErrorCode:error instanceof GoogleBusinessTokenExchangeError?error.googleErrorCode:error instanceof Error?error.name:"unknown",safeGoogleErrorDescription:safeMessage});
  if(error instanceof GoogleBusinessApiError&&error.httpStatus===429)log("google_business_retry_exhausted",{googleBusinessOperationId:callbackId,businessId:saved.businessId,stage,service:error.service,endpoint:error.endpoint,httpStatus:error.httpStatus,retryAfter:error.retryAfter,retryAttempt:0});
  log("google_business_callback_failed",{googleBusinessCallbackId:callbackId,platformRequestId:requestId,stage,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user.id,errorCode:error instanceof Error?error.name:"unknown",safeMessage,redirectDestination:redirectDestination.pathname});
  return redirect({stage,success:false,url:redirectDestination,businessId:saved.businessId,businessSlug:saved.businessSlug,userId:user.id,errorCode:error instanceof Error?error.name:"unknown"});
 }
}
