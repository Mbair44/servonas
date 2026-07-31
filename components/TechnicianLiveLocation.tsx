"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";

type TrackingState="idle"|"starting"|"active"|"error";

export default function TechnicianLiveLocation({jobId,status}:{jobId:string;status:string}){
 const router=useRouter(),watchId=useRef<number|null>(null),lastSent=useRef(0),startTravel=useRef(status==="dispatched");
 const storageKey=`servonas.live-location.${jobId}`;
 const [state,setState]=useState<TrackingState>("idle"),[message,setMessage]=useState("");
 const stopWatch=()=>{if(watchId.current!==null)navigator.geolocation.clearWatch(watchId.current);watchId.current=null;};
 const send=async(position:GeolocationPosition)=>{
  if(Date.now()-lastSent.current<12_000)return;
  lastSent.current=Date.now();
  const response=await fetch("/api/tech/location",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
   jobId,latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,
   heading:position.coords.heading,speed:position.coords.speed,capturedAt:new Date(position.timestamp).toISOString(),startTravel:startTravel.current,
  })});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"Location could not be updated.");
  startTravel.current=false;setState("active");
  const distance=Number(result.distance_meters);
  setMessage(Number.isFinite(distance)?distance<=150?"At the service-location geofence. Confirming arrival…":`${Math.max(0,Math.round(distance))} m from the service location.`:"Live location is being shared.");
  if(result.arrived_automatically||result.job_status!==status)router.refresh();
 };
 const begin=()=>{
  if(!navigator.geolocation){setState("error");setMessage("This device does not support location sharing.");return;}
  setState("starting");setMessage("Requesting precise location permission…");
  window.sessionStorage.setItem(storageKey,"true");
  watchId.current=navigator.geolocation.watchPosition(position=>void send(position).catch(error=>{setState("error");setMessage(error instanceof Error?error.message:"Location could not be updated.");}),error=>{setState("error");setMessage(error.code===error.PERMISSION_DENIED?"Location permission was denied. Enable it in your browser settings to use automatic arrival.":"A precise location could not be obtained.");},{enableHighAccuracy:true,maximumAge:5_000,timeout:20_000});
 };
 const stop=async()=>{
  stopWatch();window.sessionStorage.removeItem(storageKey);setState("idle");setMessage("");
  await fetch(`/api/tech/location?jobId=${encodeURIComponent(jobId)}`,{method:"DELETE"});
 };
 useEffect(()=>{if(window.sessionStorage.getItem(storageKey)==="true"&&["en_route","arrived","in_progress"].includes(status))begin();return stopWatch;},[]); // eslint-disable-line react-hooks/exhaustive-deps
 if(!["dispatched","en_route","arrived","in_progress"].includes(status))return null;
 return <section className={`tech-location-control ${state}`}><div><strong>{state==="active"?"Live location sharing is on":"Automatic arrival"}</strong><span>{message||"Share your location during travel so Servonas can mark you arrived after 30 seconds inside the service-area geofence."}</span></div>{state==="active"||state==="starting"?<button type="button" className="sv-button sv-secondary" onClick={()=>void stop()}>Stop sharing</button>:<button type="button" className="sv-button" onClick={begin}>{status==="dispatched"?"Start travel & share location":"Share live location"}</button>}</section>;
}
