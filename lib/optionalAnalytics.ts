const disabledValues=new Set(["1","true","on","yes","disabled"]);

function isDisabled(raw:string|undefined){
 return disabledValues.has((raw??"").trim().toLowerCase());
}

export function optionalAnalyticsEnabled(){
 return !isDisabled(process.env.DISABLE_OPTIONAL_ANALYTICS??process.env.NEXT_PUBLIC_DISABLE_OPTIONAL_ANALYTICS);
}

export function publicOptionalAnalyticsEnabled(){
 return !isDisabled(process.env.NEXT_PUBLIC_DISABLE_OPTIONAL_ANALYTICS);
}

export function bookingFunnelEnabled(){
 if(isDisabled(process.env.DISABLE_OPTIONAL_ANALYTICS??process.env.NEXT_PUBLIC_DISABLE_OPTIONAL_ANALYTICS))return false;
 return !isDisabled(process.env.DISABLE_BOOKING_FUNNEL_ANALYTICS??process.env.NEXT_PUBLIC_DISABLE_BOOKING_FUNNEL_ANALYTICS);
}

export function publicBookingFunnelEnabled(){
 if(isDisabled(process.env.NEXT_PUBLIC_DISABLE_OPTIONAL_ANALYTICS))return false;
 return !isDisabled(process.env.NEXT_PUBLIC_DISABLE_BOOKING_FUNNEL_ANALYTICS);
}
