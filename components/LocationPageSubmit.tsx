"use client";

import {useFormStatus} from "react-dom";

export function LocationPageSubmit({label,pendingLabel,secondary=false}:{label:string;pendingLabel:string;secondary?:boolean}){const {pending}=useFormStatus();return <button className={`sv-button${secondary?" sv-secondary":""}`} type="submit" disabled={pending} aria-disabled={pending}>{pending?pendingLabel:label}</button>;}
