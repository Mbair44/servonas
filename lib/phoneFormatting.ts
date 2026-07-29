export function formatPhoneInput(value:string){
 const trimmed=value.trim();
 if(trimmed.startsWith("+")&&!trimmed.startsWith("+1"))return value;
 let digits=value.replace(/\D/g,"");
 const hasCountryCode=digits.length>10&&digits.startsWith("1");
 digits=digits.slice(0,hasCountryCode?11:10);
 const local=hasCountryCode?digits.slice(1):digits;
 const formatted=[local.slice(0,3),local.slice(3,6),local.slice(6,10)].filter(Boolean).join("-");
 return hasCountryCode?`1${formatted?`-${formatted}`:""}`:formatted;
}
