type GooglePlaceCandidate={id?:string;displayName?:{text?:string};formattedAddress?:string};
export type GoogleBusinessRating={rating:number;reviewCount:number;googleMapsUri:string|null};

const key=()=>process.env.GOOGLE_MAPS_API_KEY?.trim()||process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const clean=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

export function selectGoogleBusinessCandidate(candidates:GooglePlaceCandidate[],businessName:string,businessAddress:string){
 const wanted=clean(businessName),address=clean(businessAddress),postal=businessAddress.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0,5);
 const exact=candidates.filter(place=>clean(place.displayName?.text??"")===wanted).filter(place=>{
  const candidate=clean(place.formattedAddress??"");
  if(!candidate)return false;
  if(postal&&!candidate.includes(postal))return false;
  const addressWords=address.split(" ").filter(word=>word.length>=3&&!/^\d+$/.test(word));
  return addressWords.filter(word=>candidate.includes(word)).length>=Math.min(2,addressWords.length);
 });
 return exact.length===1?exact[0]:null;
}

export async function findGoogleBusinessPlace(input:{name:string;address:string}){
 const apiKey=key();if(!apiKey)return {ok:false as const,error:"Google Places API is not configured."};
 try{
  const response=await fetch("https://places.googleapis.com/v1/places:searchText",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":apiKey,"X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress"},body:JSON.stringify({textQuery:`${input.name} ${input.address}`.trim(),maxResultCount:5})});
  const result=await response.json() as {places?:GooglePlaceCandidate[];error?:{message?:string}};
  if(!response.ok)return {ok:false as const,error:result.error?.message||`Google Places HTTP ${response.status}`};
  const place=selectGoogleBusinessCandidate(result.places??[],input.name,input.address);
  if(!place?.id)return {ok:false as const,error:"Google could not uniquely match this business name and address."};
  return {ok:true as const,placeId:place.id,displayName:place.displayName?.text??input.name,formattedAddress:place.formattedAddress??input.address};
 }catch(error){return {ok:false as const,error:error instanceof Error?error.message:"Google Places lookup failed."};}
}

export async function resolveGoogleBusinessPlaceId(placeId:string){
 const apiKey=key();if(!apiKey)return {ok:false as const,error:"Google Places API is not configured."};
 if(!/^[-_A-Za-z0-9]{10,255}$/.test(placeId))return {ok:false as const,error:"Enter a valid Google Place ID."};
 try{
  const response=await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,{headers:{"X-Goog-Api-Key":apiKey,"X-Goog-FieldMask":"id,displayName,formattedAddress"},cache:"no-store"});
  const result=await response.json() as GooglePlaceCandidate&{error?:{message?:string}};
  if(!response.ok||!result.id)return {ok:false as const,error:result.error?.message||`Google Places HTTP ${response.status}`};
  return {ok:true as const,placeId:result.id,displayName:result.displayName?.text??"Google Business",formattedAddress:result.formattedAddress??""};
 }catch(error){return {ok:false as const,error:error instanceof Error?error.message:"Google Place ID lookup failed."};}
}

export function parseGoogleBusinessRating(value:unknown):GoogleBusinessRating|null{
 if(!value||typeof value!=="object")return null;
 const result=value as {rating?:unknown;userRatingCount?:unknown;googleMapsUri?:unknown},rating=Number(result.rating),reviewCount=Number(result.userRatingCount);
 if(!Number.isFinite(rating)||rating<1||rating>5||!Number.isInteger(reviewCount)||reviewCount<1)return null;
 return {rating,reviewCount,googleMapsUri:typeof result.googleMapsUri==="string"?result.googleMapsUri:null};
}

export async function getGoogleBusinessRating(placeId:string):Promise<GoogleBusinessRating|null>{
 const apiKey=key();if(!apiKey||!placeId)return null;
 try{
  const response=await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,{headers:{"X-Goog-Api-Key":apiKey,"X-Goog-FieldMask":"rating,userRatingCount,googleMapsUri"},cache:"no-store"});
  if(!response.ok)return null;
  return parseGoogleBusinessRating(await response.json());
 }catch{return null;}
}
