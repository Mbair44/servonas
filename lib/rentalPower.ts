export type RentalPowerItem={id:string;name?:string|null;power_outlets_required?:number|null;power_instructions?:string|null};
export type RentalPowerSelection={inventoryItemId:string;quantity:number};
export type RentalPowerRequirement={totalOutlets:number;hasUnconfiguredItems:boolean;instructions:string[]};

/** One authoritative calculation for public booking, checkout, staff views,
 * and reminders. `null` means legacy/unconfigured; zero explicitly means no
 * electrical connection is needed. */
export function rentalPowerRequirement(items:RentalPowerItem[],selections:RentalPowerSelection[]):RentalPowerRequirement{
 const byId=new Map(items.map(item=>[item.id,item]));let totalOutlets=0,hasUnconfiguredItems=false;const instructions=new Set<string>();
 for(const selection of selections){const item=byId.get(selection.inventoryItemId),quantity=Math.max(0,Math.floor(Number(selection.quantity)||0));if(!item||quantity===0)continue;const outlets=item.power_outlets_required;if(outlets==null){hasUnconfiguredItems=true;continue;}totalOutlets+=Math.max(0,Math.floor(Number(outlets)||0))*quantity;if(outlets>0&&item.power_instructions?.trim())instructions.add(item.power_instructions.trim());}
 return {totalOutlets,hasUnconfiguredItems,instructions:[...instructions]};
}

export const outletLabel=(count:number)=>`${count} electrical outlet${count===1?"":"s"}`;
export function powerReminder(requirement:Pick<RentalPowerRequirement,"totalOutlets"|"hasUnconfiguredItems">,selection:string|null|undefined){
 if(requirement.hasUnconfiguredItems)return "🔌 Power reminder: Part of your rental still needs a power review. Please contact us before your event so we can confirm the setup.";
 if(requirement.totalOutlets<=0)return "";
 const base=`🔌 Power reminder: Your rental requires ${outletLabel(requirement.totalOutlets)} within 100 feet of where we’ll set up.${requirement.totalOutlets>1?" Separate circuits may be needed to safely run all blowers.":""}`;
 return selection==="unsure"?`${base} You previously indicated you weren't sure about power. Please contact us before your event so we can confirm your setup!`:`${base} Please make sure the required power is available before we arrive!`;
}
