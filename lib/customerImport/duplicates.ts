import{normalizeEmail,normalizePhone,normalizeText,type ImportValues}from"./normalize";
export type ExistingCustomer={id:string;first_name:string;last_name:string;company_name:string|null;email:string|null;phone:string|null};
export function scoreCustomerDuplicate(values:ImportValues,existing:ExistingCustomer){
 let score=0;const signals:string[]=[];
 const incomingName=normalizeText(values.company_name||`${values.first_name??""} ${values.last_name??""}`),existingName=normalizeText(existing.company_name||`${existing.first_name} ${existing.last_name}`);
 if(values.email&&existing.email&&normalizeEmail(values.email)===normalizeEmail(existing.email)){score+=70;signals.push("Same email");}
 if(values.phone&&existing.phone&&normalizePhone(values.phone)===normalizePhone(existing.phone)){score+=60;signals.push("Same phone");}
 if(incomingName&&incomingName===existingName){score+=35;signals.push("Same customer or company name");}
 return {score,signals,level:score>=100?"definite":score>=45?"possible":"none"} as const;
}
