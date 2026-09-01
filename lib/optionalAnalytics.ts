const disabledValues=new Set(["1","true","on","yes","disabled"]);

function isDisabled(raw:string|undefined){
 return disabledValues.has((raw??"").trim().toLowerCase());
}

export function optionalAnalyticsEnabled(){
 // Browser tracking can only see NEXT_PUBLIC_* values. Use the same release-time
 // flag at ingestion so a server-only toggle cannot silently discard live events.
 return publicOptionalAnalyticsEnabled();
}

export function publicOptionalAnalyticsEnabled(){
 return !isDisabled(process.env.NEXT_PUBLIC_DISABLE_OPTIONAL_ANALYTICS);
}

export function bookingFunnelEnabled(){
 return publicBookingFunnelEnabled();
}

export function publicBookingFunnelEnabled(){
 if(isDisabled(process.env.NEXT_PUBLIC_DISABLE_OPTIONAL_ANALYTICS))return false;
 return !isDisabled(process.env.NEXT_PUBLIC_DISABLE_BOOKING_FUNNEL_ANALYTICS);
}
