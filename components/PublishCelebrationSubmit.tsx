"use client";

import {useState} from "react";
import {useFormStatus} from "react-dom";

export function PublishCelebrationSubmit({label,celebratingLabel}:{label:string;celebratingLabel?:string;}){
 const {pending}=useFormStatus();
 const [celebrating,setCelebrating]=useState(false);
 const activeLabel=celebratingLabel??label;

 return <button className="sv-button" type="submit" disabled={pending} aria-disabled={pending} onClick={()=>setCelebrating(true)}>{pending||celebrating?activeLabel:label}</button>;
}
