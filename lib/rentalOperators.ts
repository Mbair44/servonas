export type OperatorMode="none"|"optional"|"required";
export type OperatorConfiguredItem={operator_mode?:OperatorMode|null;operator_hourly_rate_cents?:number|null;operator_default_selected?:boolean|null};

export function billableOperatorHours(startsAt:Date,endsAt:Date){
 const milliseconds=endsAt.getTime()-startsAt.getTime();
 return milliseconds>0?Math.ceil(milliseconds/(60*60*1000)):0;
}

export function operatorSelection(item:OperatorConfiguredItem,requested:boolean|undefined){
 return item.operator_mode==="required"||item.operator_mode==="optional"&&(requested??Boolean(item.operator_default_selected));
}

export function operatorCharge(item:OperatorConfiguredItem,startsAt:Date,endsAt:Date,quantity=1,requested?:boolean){
 const mode=(item.operator_mode??"none") as OperatorMode,selected=operatorSelection(item,requested),hours=selected?billableOperatorHours(startsAt,endsAt):0,rate=selected?Math.max(0,Number(item.operator_hourly_rate_cents??0)):0;
 return {mode,selected,hours,rateCents:rate,chargeCents:hours*rate*Math.max(1,quantity)};
}
