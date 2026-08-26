const enabledValues=new Set(["0","false","off","no","disabled",""]);

export function optionalAnalyticsEnabled(){
 const raw=(process.env.DISABLE_OPTIONAL_ANALYTICS??process.env.NEXT_PUBLIC_DISABLE_OPTIONAL_ANALYTICS??"").trim().toLowerCase();
 return !enabledValues.has(raw);
}

export function publicOptionalAnalyticsEnabled(){
 const raw=(process.env.NEXT_PUBLIC_DISABLE_OPTIONAL_ANALYTICS??"").trim().toLowerCase();
 return !enabledValues.has(raw);
}

export function bookingFunnelEnabled(){
 const raw=(process.env.DISABLE_BOOKING_FUNNEL_ANALYTICS??process.env.NEXT_PUBLIC_DISABLE_BOOKING_FUNNEL_ANALYTICS??"").trim().toLowerCase();
 return !enabledValues.has(raw);
}

export function publicBookingFunnelEnabled(){
 const raw=(process.env.NEXT_PUBLIC_DISABLE_BOOKING_FUNNEL_ANALYTICS??"").trim().toLowerCase();
 return !enabledValues.has(raw);
}
