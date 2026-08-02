export const poolChemistryFields=[
 ["free_chlorine_ppm","Free Chlorine (ppm)"],["ph","pH"],["total_alkalinity_ppm","Total Alkalinity (ppm)"],
 ["cyanuric_acid_ppm","Cyanuric Acid / CYA (ppm)"],["calcium_hardness_ppm","Calcium Hardness (ppm)"],
 ["salt_ppm","Salt (ppm)"],["water_temperature_f","Water Temperature (°F)"],
] as const;
export type PoolChemistryField=typeof poolChemistryFields[number][0];
export const defaultPoolChemistryFields=poolChemistryFields.map(([key])=>key);
export const defaultPoolChemicals=["Liquid chlorine","Chlorine tablets","Muriatic acid","Sodium bicarbonate","Calcium chloride","Stabilizer","Salt","Algaecide"];
export const defaultPoolChecklist=["Skim pool","Brush walls/steps","Vacuum","Empty pump basket","Empty skimmer baskets","Check filter pressure","Inspect equipment","Clean filter","Check water level"];

export function poolTrend(current:number|null|undefined,previous:number|null|undefined){
 if(current==null||previous==null)return null;
 const tolerance=Math.max(Math.abs(previous)*.01,.01);
 return current>previous+tolerance?"up":current<previous-tolerance?"down":"steady";
}

type Reading=Partial<Record<PoolChemistryField,number|null>>;
type Range={field_key:string;minimum_value:number|null;maximum_value:number|null;consecutive_visits:number};
export function poolHealthAlerts(readings:Reading[],ranges:Range[]){
 return ranges.flatMap(range=>{
  const values=readings.slice(0,Math.max(1,range.consecutive_visits)).map(row=>row[range.field_key as PoolChemistryField]).filter((value):value is number=>value!=null);
  if(values.length<range.consecutive_visits)return [];
  const high=range.maximum_value!=null&&values.every(value=>value>range.maximum_value!);
  const low=range.minimum_value!=null&&values.every(value=>value<range.minimum_value!);
  return high||low?[{field:range.field_key,direction:high?"high":"low",visits:range.consecutive_visits}]:[];
 });
}

export function steadilyDecreasing(values:(number|null|undefined)[],minimumVisits=3){
 const recent=values.slice(0,minimumVisits);
 return recent.length===minimumVisits&&recent.every((value,index)=>value!=null&&(index===recent.length-1||value<Number(recent[index+1])));
}

export function chemicalCostSpike(currentCents:number,priorVisitCosts:number[]){
 if(priorVisitCosts.length<3)return false;
 const average=priorVisitCosts.reduce((sum,value)=>sum+value,0)/priorVisitCosts.length;
 return average>0&&currentCents>average*1.5;
}
