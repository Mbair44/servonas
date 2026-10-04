type ProviderDetails={tax_breakdown?:Array<{taxability_reason?:unknown}>|null};

export function bookingTaxLineDiagnostics(input:{items:Array<{id:string;name:string}>;lines:Array<{id:string;amountCents:number;taxCode?:string|null;taxCodeSource?:string|null}>;snapshots:Array<{id:string;taxCents:number;providerDetails?:unknown}>}){
 return input.lines.map(line=>{
  const item=input.items.find(value=>value.id===line.id),snapshot=input.snapshots.find(value=>value.id===line.id),details=snapshot?.providerDetails as ProviderDetails|undefined;
  const taxabilityReasons=[...new Set((details?.tax_breakdown??[]).map(value=>typeof value.taxability_reason==="string"?value.taxability_reason:null).filter((value):value is string=>Boolean(value)))];
  return {itemName:item?.name??"Unknown rental",amountCents:line.amountCents,effectiveTaxCode:line.taxCode??null,taxCodeSource:line.taxCodeSource??null,returnedTaxCents:snapshot?.taxCents??0,taxabilityReasons};
 });
}
