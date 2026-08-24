"use client";

import {useMemo,useState} from "react";
import {useFormStatus} from "react-dom";

function burstParticles(count:number){
 return Array.from({length:count},(_,index)=>({
  id:index,
  left:`${4+Math.random()*92}%`,
  delay:`${Math.random()*0.18}s`,
  duration:`${0.95+Math.random()*0.55}s`,
  rotate:`${-35+Math.random()*70}deg`,
 }));
}

export function PublishCelebrationSubmit({label,celebratingLabel}:{label:string;celebratingLabel?:string;}){
 const {pending}=useFormStatus();
 const [celebrating,setCelebrating]=useState(false);
 const particles=useMemo(()=>burstParticles(30),[]);
 const activeLabel=celebratingLabel??label;

 return <>
  <button
   className="sv-button"
   type="submit"
   disabled={pending}
   aria-disabled={pending}
   onClick={event=>{
    if(pending||celebrating)return;
    event.preventDefault();
    setCelebrating(true);
    const form=event.currentTarget.form;
    window.setTimeout(()=>form?.requestSubmit(),320);
   }}
  >
   {pending||celebrating?activeLabel:label}
  </button>
  {celebrating&&!pending&&<div className="publish-celebration-overlay" aria-hidden="true">{particles.map(particle=><i key={particle.id} style={{left:particle.left,animationDelay:particle.delay,animationDuration:particle.duration,rotate:particle.rotate}}/>)}</div>}
 </>;
}
