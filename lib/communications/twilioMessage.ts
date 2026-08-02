import {getTwilioCredentials} from "@/lib/communications/twilioCredentials";

export async function sendTwilioMessage({to,from,body}:{to:string;from?:string|null;body:string}){
 const twilio=getTwilioCredentials();
 if(!twilio.configured)throw new Error("Twilio outbound delivery is not configured.");
 const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${twilio.username}:${twilio.password}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({To:to,From:from||twilio.from!,Body:body})});
 const result=await response.json() as {sid?:string;message?:string;code?:number};
 if(!response.ok||!result.sid)throw new Error(result.message||`Twilio HTTP ${response.status}`);
 return {sid:result.sid};
}
