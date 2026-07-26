export const parseWorkTypes=(value:string)=>[...new Set(value.split(/[\n,]/).map(item=>item.trim()).filter(Boolean))];
export function validateWorkforcePreferences(input:{preferred:string[];avoided:string[];start:string;end:string}){
 if(input.preferred.some(item=>item.length>150)||input.avoided.some(item=>item.length>150))return "Work type labels must be 150 characters or fewer.";
 if(input.preferred.some(item=>input.avoided.includes(item)))return "A work type cannot be both preferred and avoided.";
 if(input.start&&input.end&&input.end<=input.start)return "Preferred end time must be after the start time.";
 return null;
}
