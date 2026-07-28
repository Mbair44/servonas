export const isValidCrmEmail = (value: string) =>
  !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const crmPhoneDigits = (value: string) => value.replace(/\D/g, "");
const comparablePhone = (value: string) => {
  const digits = crmPhoneDigits(value);
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};

export const isValidCrmPhone = (value: string) =>
  !value || crmPhoneDigits(value).length >= 10;

export function isPotentialCustomerDuplicate(
  candidate: { email?: string | null; phone?: string | null },
  email: string,
  phone: string,
) {
  const digits = comparablePhone(phone);
  return Boolean(
    (email && candidate.email?.toLowerCase() === email.toLowerCase()) ||
    (digits && comparablePhone(candidate.phone ?? "") === digits),
  );
}

type CustomerWriteError={code?:string|null;message?:string|null};
const customerFieldLabels:Record<string,string>={
 first_name:"First name",last_name:"Last name",business_id:"Business",preferred_contact_method:"Preferred contact",
 is_active:"Status",created_by:"Created by",updated_by:"Updated by",
};

export function customerWriteErrorMessage(error:CustomerWriteError|undefined,operation:"created"|"saved"){
 const fallback=`The customer could not be ${operation}.`;
 if(!error?.code)return `${fallback} Please try again.`;
 if(error.code==="23505")return "A customer with that email already exists in this business.";
 if(error.code==="23502"){
  const column=error.message?.match(/column "([^"]+)"/)?.[1];
  return column&&customerFieldLabels[column]?`${customerFieldLabels[column]} is required.`:`${fallback} A required customer field is missing.`;
 }
 if(error.code==="23514")return `${fallback} One or more values do not satisfy the customer data rules.`;
 if(error.code==="23503")return `${fallback} The business or signed-in user relationship could not be verified.`;
 if(error.code==="42501")return `You do not have permission to ${operation==="created"?"create":"save"} this customer.`;
 if(error.code==="42P01"||error.code==="42703"||error.code.startsWith("PGRST"))return `${fallback} The customer database migration is not fully applied.`;
 return `${fallback} Reference code: ${error.code}.`;
}
