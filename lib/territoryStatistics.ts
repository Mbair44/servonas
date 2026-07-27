import type {TerritoryGeometry} from "./territoryMap.ts";

export type TerritoryStatisticDefinition={
 id:string;territory_type:string;postal_codes:string[];neighborhoods:string[];boundary_geojson:TerritoryGeometry|null;
 strategy_config:{cities?:string[];center?:{latitude:number;longitude:number};radius_meters?:number};
};
export type TerritoryStatisticLocation={latitude:number;longitude:number;postalCode?:string;city?:string;neighborhood?:string};
const normalized=(value?:string)=>value?.trim().toLowerCase()??"";

const ringContains=(ring:number[][],latitude:number,longitude:number)=>{
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [xi,yi]=ring[i],[xj,yj]=ring[j];
  if(((yi>latitude)!==(yj>latitude))&&(longitude<(xj-xi)*(latitude-yi)/(yj-yi)+xi))inside=!inside;
 }
 return inside;
};
const geometryContains=(geometry:TerritoryGeometry,latitude:number,longitude:number)=>{
 const polygons=geometry.type==="Polygon"?[geometry.coordinates as number[][][]]:geometry.coordinates as number[][][][];
 return polygons.some(polygon=>ringContains(polygon[0]??[],latitude,longitude)
  &&!polygon.slice(1).some(hole=>ringContains(hole,latitude,longitude)));
};
const distanceMeters=(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number})=>{
 const radians=(value:number)=>value*Math.PI/180,dLat=radians(b.latitude-a.latitude),dLon=radians(b.longitude-a.longitude);
 const value=Math.sin(dLat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dLon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(value),Math.sqrt(1-value));
};

export function territoryContainsLocation(territory:TerritoryStatisticDefinition,location:TerritoryStatisticLocation){
 const matches=[
  Boolean(territory.boundary_geojson&&geometryContains(territory.boundary_geojson,location.latitude,location.longitude)),
  Boolean(territory.postal_codes.some(value=>normalized(value)===normalized(location.postalCode))),
  Boolean(territory.neighborhoods.some(value=>normalized(value)===normalized(location.neighborhood))),
  Boolean(territory.strategy_config.cities?.some(value=>normalized(value)===normalized(location.city))),
  Boolean(territory.strategy_config.center&&territory.strategy_config.radius_meters
    &&distanceMeters(territory.strategy_config.center,location)<=territory.strategy_config.radius_meters),
 ];
 return matches.some(Boolean);
}
