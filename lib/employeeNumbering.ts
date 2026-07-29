export type EmployeeNumbering={
 autoAssignEnabled:boolean;prefix:string;startingNumber:number;nextNumber:number;minimumDigits:number;allowManualOverride:boolean;
};
export const defaultEmployeeNumbering:EmployeeNumbering={autoAssignEnabled:true,prefix:"",startingNumber:1001,nextNumber:1001,minimumDigits:4,allowManualOverride:true};
export function formatEmployeeNumber(prefix:string,sequence:number,minimumDigits:number){
 return `${prefix.trim()}${String(sequence).padStart(minimumDigits,"0")}`;
}
export function validateEmployeeNumbering(value:EmployeeNumbering){
 if(!Number.isSafeInteger(value.startingNumber)||value.startingNumber<1)return "Starting number must be a positive integer.";
 if(!Number.isSafeInteger(value.nextNumber)||value.nextNumber<1)return "Next number must be a positive integer.";
 if(!Number.isInteger(value.minimumDigits)||value.minimumDigits<1||value.minimumDigits>10)return "Minimum digits must be between 1 and 10.";
 if(value.prefix.trim().length>10||!/^[A-Za-z0-9_-]*$/.test(value.prefix.trim()))return "Prefix may use up to 10 letters, numbers, hyphens, or underscores.";
 return null;
}
