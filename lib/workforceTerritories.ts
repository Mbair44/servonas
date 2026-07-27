import {validateTerritoryGeometry,type TerritoryGeometry} from "./territoryMap.ts";

export const TERRITORY_TYPES=["mixed","postal_codes","neighborhoods","polygon","radius","city_boundaries","delivery_zone","service_area"] as const;
export type TerritoryType=(typeof TERRITORY_TYPES)[number];
export type TerritoryStrategyConfig={
 cities?:string[];
 center?:{latitude:number;longitude:number};
 radius_meters?:number;
};

export const splitTerritoryValues=(value:string)=>
 [...new Set(value.split(/[\n,]/).map(item=>item.trim()).filter(Boolean))];

export function validateTerritory(input:{name:string;type:string;postalCodes:string[];neighborhoods:string[];boundary:string;color?:string;description?:string;notes?:string;strategyConfig?:TerritoryStrategyConfig}){
 if(!input.name||input.name.length>150)return "Enter a territory name up to 150 characters.";
 if(!TERRITORY_TYPES.includes(input.type as TerritoryType))return "Choose a valid territory type.";
 if(input.color&&!/^#[0-9a-f]{6}$/i.test(input.color))return "Choose a valid six-digit territory color.";
 if((input.description?.length??0)>2000)return "Territory descriptions must be 2,000 characters or fewer.";
 if((input.notes?.length??0)>4000)return "Territory notes must be 4,000 characters or fewer.";
 if(input.postalCodes.some(code=>code.length>20))return "ZIP or postal codes must be 20 characters or fewer.";
 if(input.neighborhoods.some(name=>name.length>150))return "Neighborhood names must be 150 characters or fewer.";
 if((input.strategyConfig?.cities??[]).some(name=>!name||name.length>150))return "City names must be 150 characters or fewer.";
 if(input.type==="polygon"&&!input.boundary)return "Draw a boundary before saving a polygon territory.";
 if(input.type==="radius"){
  const center=input.strategyConfig?.center,radius=input.strategyConfig?.radius_meters;
  if(!center||!Number.isFinite(center.latitude)||center.latitude < -90||center.latitude > 90
   ||!Number.isFinite(center.longitude)||center.longitude < -180||center.longitude > 180)
   return "Enter valid latitude and longitude for the radius center.";
  if(!Number.isFinite(radius)||radius!<=0||radius!>804672)return "Radius must be greater than 0 and no more than 500 miles.";
 }
 if(input.boundary){
  try{
   const geometry=JSON.parse(input.boundary) as {type?:string;coordinates?:unknown};
   if(!["Polygon","MultiPolygon"].includes(geometry.type??"")||!Array.isArray(geometry.coordinates))return "Boundary must be a GeoJSON Polygon or MultiPolygon.";
   const geometryError=validateTerritoryGeometry(geometry as TerritoryGeometry);
   if(geometryError)return geometryError;
  }catch{return "Boundary must contain valid GeoJSON.";}
 }
 return null;
}
