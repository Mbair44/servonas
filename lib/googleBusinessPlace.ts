type GooglePlaceCandidate={id?:string;displayName?:{text?:string};formattedAddress?:string};
export type GoogleBusinessRating={rating:number;reviewCount:number;googleMapsUri:string|null};

const key=()=>process.env.GOOGLE_MAPS_API_KEY?.trim()||process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const clean=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

export function selectGoogleBusinessCandidate(candidates:GooglePlaceCandidate[],businessName:string){
 const wanted=clean(businessName),exact=candidates.find(place=>clean(place.displayName?.text??"")===wanted);
 return exact??(candidates.length===1?candidates[0]:null);
}

export async function findGoogleBusinessPlace(input:{name:string;address:string}){
 const apiKey=key();if(!apiKey)return {ok:false as const,error:"Google Places API is not configured."};
 try{
  const response=await fetch("https://places.googleapis.com/v1/places:searchText",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":apiKey,"X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress"},body:JSON.stringify({textQuery:`${input.name} ${input.address}`.trim(),maxResultCount:5})});
  const result=await response.json() as {places?:GooglePlaceCandidate[];error?:{message?:string}};
  if(!response.ok)return {ok:false as const,error:result.error?.message||`Google Places HTTP ${response.status}`};
  const place=selectGoogleBusinessCandidate(result.places??[],input.name);
  if(!place?.id)return {ok:false as const,error:"Google could not uniquely match this business name and address."};
  return {ok:true as const,placeId:place.id,displayName:place.displayName?.text??input.name,formattedAddress:place.formattedAddress??input.address};
 }catch(error){return {ok:false as const,error:error instanceof Error?error.message:"Google Places lookup failed."};}
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
