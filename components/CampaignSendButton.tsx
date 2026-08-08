"use client";

import {useFormStatus} from "react-dom";

export function CampaignSendButton({retry=false}:{retry?:boolean}){
 const {pending}=useFormStatus();
 return <><button className="sv-button" type="submit" disabled={pending} aria-disabled={pending}>{pending?"Sending…":retry?"Retry failed recipients":"Send campaign"}</button>{pending&&<div className="campaign-send-overlay" role="status" aria-live="polite" aria-label="Sending campaign"><section><i aria-hidden="true"/><h2>Sending campaign</h2><p>Servonas is sending the messages and recording the results. Please keep this window open.</p></section></div>}</>;
}
