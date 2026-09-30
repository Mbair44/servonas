export type EquipmentAssumptions={purchase_cost_cents:number|null;expected_lifetime_rentals:number|null;salvage_value_cents:number;profitability_tracking_enabled:boolean;stock_quantity:number};
export type EquipmentProfitabilityRow={completed_units:number|string;tracked_units:number|string;reviewed_units:number|string;revenue_cents:number|string|null;contribution_cents:number|string|null;equipment_cents:number|string|null;fully_loaded_cents:number|string|null;estimated_contribution_cents?:number|string|null;estimated_fully_loaded_cents?:number|string|null;excluded_equipment_items?:number|string;refund_review_units?:number|string};
export function equipmentCostPerRental(item:EquipmentAssumptions){
 if(!item.profitability_tracking_enabled)return 0;
 const {purchase_cost_cents:cost,expected_lifetime_rentals:life,salvage_value_cents:salvage,stock_quantity:stock}=item;
 if(cost==null||life==null||![cost,life,salvage,stock].every(Number.isSafeInteger)||cost<0||life<=0||salvage<0||salvage>cost||stock<1)return null;
 return (cost-salvage)/(life*stock);
}
export function equipmentProfitability(item:EquipmentAssumptions,row?:EquipmentProfitabilityRow){
 const completed=Number(row?.completed_units??0),reviewed=Number(row?.reviewed_units??0),tracked=Number(row?.tracked_units??0);
 const contribution=row?.contribution_cents==null?null:Number(row.contribution_cents),allocated=row?.equipment_cents==null?(tracked>0?null:0):Number(row.equipment_cents);
 const cost=item.purchase_cost_cents,expected=item.expected_lifetime_rentals==null?null:item.expected_lifetime_rentals*item.stock_quantity;
 const remaining=cost==null||contribution==null?null:Math.max(cost-contribution,0);
 return {completed,reviewed,tracked,contribution,allocated,perRental:equipmentCostPerRental(item),expected,
  lifePercent:expected?completed/expected*100:null,remainingRentals:expected==null?null:Math.max(expected-completed,0),
  recoveredPercent:cost!=null&&cost>0&&contribution!=null?Math.max(0,contribution/cost*100):null,
  remainingAllocation:cost==null||allocated==null?null:Math.max(cost-item.salvage_value_cents-allocated,0),
  rentalsUntilRecovered:remaining===0?0:remaining!=null&&reviewed>=3&&contribution!=null&&contribution>0?Math.ceil(remaining/(contribution/reviewed)):null,
 };
}
export function profitabilityAssumptionsFromForm(form:FormData){
 const raw=String(form.get('expectedLifetimeRentals')??'').trim(),resaleRaw=String(form.get('salvageValue')??'').trim();
 const life=raw===''?null:Number(raw);
 if(life!==null&&(!Number.isSafeInteger(life)||life<1||life>10000000))throw Error('Enter a positive whole number of expected lifetime rentals.');
 if(resaleRaw!==''&&!/^\d+(?:\.\d{1,2})?$/.test(resaleRaw))throw Error('Enter a valid expected resale value.');
 const resale=Math.round(Number(resaleRaw||0)*100),purchaseRaw=String(form.get('purchaseCost')??'').trim(),purchase=purchaseRaw===''?null:Math.round(Number(purchaseRaw)*100);
 if(!Number.isSafeInteger(resale)||resale<0||resale>2147483647||(purchase!==null&&resale>purchase))throw Error('Expected resale value cannot exceed purchase cost.');
 return {expected_lifetime_rentals:life,salvage_value_cents:resale,profitability_tracking_enabled:form.get('profitabilityTracking')==='on'};
}
