import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

type TokenResponse={access_token?:string;refresh_token?:string;error?:string;error_description?:string};
type GoogleLocation={name?:string;title?:string};
export type GoogleProfileReview={author:string;authorUri:string|null;rating:number;text:string;publishedAt:string|null};
export type GoogleProfileReviews={rating:number;reviewCount:number;reviews:GoogleProfileReview[]};

const credentials=()=>({clientId:process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim(),clientSecret:process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim()});
export const googleBusinessRedirectUri=()=>`${(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||"https://servonas.com").replace(/\/$/,"")}/api/google-business/callback`;

async function tokenRequest(params:URLSearchParams){
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params,cache:"no-store"});
 const result=await response.json() as TokenResponse;if(!response.ok||!result.access_token)throw new Error(result.error_description||result.error||"Google authorization failed.");return result;
}
export async function exchangeGoogleBusinessCode(code:string){const {clientId,clientSecret}=credentials();if(!clientId||!clientSecret)throw new Error("Google Business OAuth is not configured.");return tokenRequest(new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:googleBusinessRedirectUri(),grant_type:"authorization_code"}));}
async function refreshAccessToken(refreshToken:string){const {clientId,clientSecret}=credentials();if(!clientId||!clientSecret)throw new Error("Google Business OAuth is not configured.");return (await tokenRequest(new URLSearchParams({refresh_token:refreshToken,client_id:clientId,client_secret:clientSecret,grant_type:"refresh_token"}))).access_token!;}
async function googleGet<T>(url:string,accessToken:string){const response=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`},cache:"no-store"});const result=await response.json() as T&{error?:{message?:string}};if(!response.ok)throw new Error(result.error?.message||`Google Business Profile HTTP ${response.status}`);return result;}

export async function listGoogleBusinessLocations(accessToken:string){
 const accounts=await googleGet<{accounts?:{name?:string}[]}>("https://mybusinessaccountmanagement.googleapis.com/v1/accounts",accessToken),locations:{accountId:string;locationId:string;title:string}[]=[];
 for(const account of accounts.accounts??[]){if(!account.name)continue;const result=await googleGet<{locations?:GoogleLocation[]}>(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title&pageSize=100`,accessToken);for(const location of result.locations??[]){const locationId=location.name?.split("/").pop();if(locationId)locations.push({accountId:account.name.split("/").pop()!,locationId,title:location.title||"Google Business Profile"});}}
 return locations;
}

const stars:Record<string,number>={ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5};
export async function getGoogleBusinessProfileReviews(businessId:string):Promise<GoogleProfileReviews|null>{
 const db=getSupabaseAdmin();if(!db)return null;const {data:connection}=await db.from("business_google_profile_connections").select("refresh_token,google_account_id,google_location_id,status").eq("business_id",businessId).maybeSingle();if(!connection||connection.status!=="connected")return null;
 try{const accessToken=await refreshAccessToken(connection.refresh_token),result=await googleGet<{averageRating?:number;totalReviewCount?:number;reviews?:{reviewer?:{displayName?:string;profilePhotoUrl?:string};starRating?:string;comment?:string;createTime?:string}[]}>(`https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(connection.google_account_id)}/locations/${encodeURIComponent(connection.google_location_id)}/reviews?pageSize=5&orderBy=updateTime%20desc`,accessToken);return {rating:Number(result.averageRating||0),reviewCount:Number(result.totalReviewCount||0),reviews:(result.reviews??[]).map(review=>({author:review.reviewer?.displayName||"Google user",authorUri:null,rating:stars[review.starRating||""]||0,text:review.comment||"",publishedAt:review.createTime||null})).filter(review=>review.rating>0&&review.text)};}catch(error){console.error("Google Business Profile review sync failed",{businessId,message:error instanceof Error?error.message:"unknown"});return null;}
}
