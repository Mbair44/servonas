"use client";
import Link from "next/link";
import {useEffect,useState} from "react";

export default function SubscriptionTrialBanner({businessSlug,deadline,deadlineLabel}:{businessSlug:string;deadline:string;deadlineLabel:string}){
 const storageKey=`servonas.subscription-warning.dismissed.${businessSlug}.${deadline}`;
 const [visible,setVisible]=useState(false);
 useEffect(()=>setVisible(window.sessionStorage.getItem(storageKey)!=="true"),[storageKey]);
 if(!visible)return null;
 return <aside className="subscription-trial-banner" role="status"><div><strong>Subscription billing is not set up.</strong><span>This workspace will be deactivated on {deadlineLabel} unless a payment method is added.</span></div><Link href={`/app/${businessSlug}/settings#servonas-subscription`}>Set up billing</Link><button type="button" aria-label="Dismiss subscription reminder" title="Dismiss" onClick={()=>{window.sessionStorage.setItem(storageKey,"true");setVisible(false);}}>×</button></aside>;
}
