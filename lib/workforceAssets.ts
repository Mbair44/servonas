export const WORKFORCE_ASSET_TYPES=["vehicle","trailer","equipment","tablet","key","safety_equipment","other"] as const;
export const WORKFORCE_ASSET_CONDITIONS=["new","good","fair","poor","out_of_service"] as const;

export function validateWorkforceAsset(input:{name:string;type:string;year:number|null}){
 if(!input.name||input.name.length>150)return "Enter an asset name up to 150 characters.";
 if(!WORKFORCE_ASSET_TYPES.includes(input.type as typeof WORKFORCE_ASSET_TYPES[number]))return "Choose a valid asset type.";
 if(input.year!==null&&(!Number.isInteger(input.year)||input.year<1900||input.year>2200))return "Enter a valid model year.";
 return null;
}
