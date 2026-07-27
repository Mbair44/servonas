export const TERRITORY_OVERLAY_LAYERS=[
 "customers","prospects","active_jobs","scheduled_appointments","recurring_customers",
 "technician_homes","offices","current_routes","vehicles",
] as const;
export type TerritoryOverlayLayer=(typeof TERRITORY_OVERLAY_LAYERS)[number];
export type TerritoryOverlayPoint={
 id:string;layer:Exclude<TerritoryOverlayLayer,"current_routes">;latitude:number;longitude:number;
 label:string;detail?:string;
};
export type TerritoryOverlayRoute={id:string;encodedPolyline:string};
export const TERRITORY_HEAT_LAYERS=[
 "customer_density","recurring_revenue","job_density","callback_density","drive_time_density","growth_opportunities",
] as const;
export type TerritoryHeatLayer=(typeof TERRITORY_HEAT_LAYERS)[number];
export type TerritoryHeatPoint={id:string;layer:TerritoryHeatLayer;latitude:number;longitude:number;weight:number;label:string};

export function validOverlayPoint(latitude:number,longitude:number){
 return Number.isFinite(latitude)&&latitude>=-90&&latitude<=90
  &&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180
  &&!(latitude===0&&longitude===0);
}

export function decodeEncodedPolyline(value:string){
 const points:{lat:number;lng:number}[]=[];let index=0,latitude=0,longitude=0;
 while(index<value.length){
  const read=()=>{let result=0,shift=0,byte:number;do{byte=value.charCodeAt(index++)-63;result|=(byte&31)<<shift;shift+=5;}while(byte>=32&&index<=value.length);return(result&1)?~(result>>1):result>>1;};
  latitude+=read();longitude+=read();
  points.push({lat:latitude/1e5,lng:longitude/1e5});
 }
 return points;
}

export function heatScale(weight:number,maxWeight:number){
 if(!Number.isFinite(weight)||weight<=0||!Number.isFinite(maxWeight)||maxWeight<=0)return 0;
 return Math.max(.18,Math.min(1,Math.sqrt(weight/maxWeight)));
}
