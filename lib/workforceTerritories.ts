export const splitTerritoryValues=(value:string)=>
 [...new Set(value.split(/[\n,]/).map(item=>item.trim()).filter(Boolean))];

export function validateTerritory(input:{name:string;type:string;postalCodes:string[];neighborhoods:string[];boundary:string}){
 if(!input.name||input.name.length>150)return "Enter a territory name up to 150 characters.";
 if(!["postal_codes","neighborhoods","polygon","mixed"].includes(input.type))return "Choose a valid territory type.";
 if(input.postalCodes.some(code=>code.length>20))return "ZIP or postal codes must be 20 characters or fewer.";
 if(input.neighborhoods.some(name=>name.length>150))return "Neighborhood names must be 150 characters or fewer.";
 if(input.boundary){
  try{
   const geometry=JSON.parse(input.boundary) as {type?:string;coordinates?:unknown};
   if(!["Polygon","MultiPolygon"].includes(geometry.type??"")||!Array.isArray(geometry.coordinates))return "Boundary must be a GeoJSON Polygon or MultiPolygon.";
  }catch{return "Boundary must contain valid GeoJSON.";}
 }
 return null;
}
