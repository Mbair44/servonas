"use client";

import {useEffect,useRef,useState} from "react";
import {parseGoogleAddressComponents,type GoogleAddressComponent} from "@/lib/googleAddressComponents";

const states=["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

export function DomainRegistrantAddressFields({apiKey,address1="",address2="",city="",state="",zip=""}:{apiKey?:string;address1?:string|null;address2?:string|null;city?:string|null;state?:string|null;zip?:string|null}){
 const [street,setStreet]=useState(address1??""),[unit,setUnit]=useState(address2??""),[locality,setLocality]=useState(city??""),[region,setRegion]=useState((state??"").toUpperCase()),[postalCode,setPostalCode]=useState(zip??""),[country,setCountry]=useState("US"),[placeId,setPlaceId]=useState(""),[message,setMessage]=useState(apiKey?"Start typing and choose a Google suggestion to fill the address.":"Google suggestions are unavailable. You can still enter the address manually.");
 const addressRef=useRef<HTMLInputElement>(null);
 const clearVerification=()=>setPlaceId("");
 useEffect(()=>{
  if(!apiKey||!addressRef.current)return;
  let attempts=0,timer:ReturnType<typeof setTimeout>|undefined;
  const initialize=()=>{
   const places=(window as typeof window&{google?:{maps?:{places?:{Autocomplete:new(input:HTMLInputElement,options:object)=>{addListener:(name:string,callback:()=>void)=>void;getPlace:()=>{place_id?:string;formatted_address?:string;address_components?:GoogleAddressComponent[]}}}}}}).google?.maps?.places;
   if(!places||!addressRef.current){if(++attempts<20)timer=setTimeout(initialize,150);else setMessage("Google suggestions could not be loaded. Enter the address manually.");return;}
   const autocomplete=new places.Autocomplete(addressRef.current,{types:["address"],fields:["place_id","formatted_address","address_components"]});
   autocomplete.addListener("place_changed",()=>{
    const place=autocomplete.getPlace();if(!place.place_id||!place.formatted_address){setMessage("Choose a complete street address from the suggestions.");return;}
    const parsed=parseGoogleAddressComponents(place.address_components,place.formatted_address);
    setPlaceId(place.place_id);setStreet(parsed.streetAddress||place.formatted_address);setUnit(parsed.unit);setLocality(parsed.city);setRegion(parsed.state);setPostalCode(parsed.postalCode);setCountry(parsed.country||"US");setMessage("Google address selected. Confirm the details below before registering.");
   });
  };
  if((window as typeof window&{google?:{maps?:{places?:unknown}}}).google?.maps?.places)initialize();
  else{const existing=document.querySelector<HTMLScriptElement>('script[data-servonas-google-places="true"]');if(existing)existing.addEventListener("load",initialize,{once:true});else{const script=document.createElement("script");script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;script.async=true;script.defer=true;script.dataset.servonasGooglePlaces="true";script.addEventListener("load",initialize,{once:true});script.addEventListener("error",()=>setMessage("Google suggestions could not be loaded. Enter the address manually."),{once:true});document.head.appendChild(script);}}
  return()=>{if(timer)clearTimeout(timer);};
 },[apiKey]);
 return <>
  <input type="hidden" name="googlePlaceId" value={placeId}/>
  <label className="admin-domain-address">Address<input ref={addressRef} required name="address1" autoComplete="street-address" placeholder="Start typing a street address…" value={street} onChange={event=>{setStreet(event.target.value);clearVerification();}}/><small>{message}</small></label>
  <label>Address line 2<input name="address2" autoComplete="address-line2" value={unit} onChange={event=>setUnit(event.target.value)}/></label>
  <label>City<input required name="city" autoComplete="address-level2" value={locality} onChange={event=>{setLocality(event.target.value);clearVerification();}}/></label>
  <label>State<select required name="state" autoComplete="address-level1" value={region} onChange={event=>{setRegion(event.target.value);clearVerification();}}><option value="">Select state</option>{states.map(item=><option value={item} key={item}>{item}</option>)}</select></label>
  <label>ZIP<input required name="zip" autoComplete="postal-code" value={postalCode} onChange={event=>{setPostalCode(event.target.value);clearVerification();}}/></label>
  <label>Country<select required name="country" autoComplete="country" value={country} onChange={event=>{setCountry(event.target.value);clearVerification();}}><option value="US">United States</option><option value="CA">Canada</option></select></label>
 </>;
}
