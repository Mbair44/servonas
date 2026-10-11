export type AttributionModel="first_touch"|"last_touch"|"last_non_direct";
export type AttributionTouch={source:string;medium?:string|null;campaign?:string|null;campaign_id?:string|null;landing_path?:string|null;landing_url?:string|null;referrer?:string|null;occurred_at:string;gclid?:string|null;gbraid?:string|null;wbraid?:string|null;fbclid?:string|null;session_id?:string|null};
export type VisitorAttribution={firstTouch:AttributionTouch;lastTouch:AttributionTouch;lastNonDirectTouch:AttributionTouch|null};
const at=(touch:AttributionTouch)=>Date.parse(touch.occurred_at);
export const isNonDirectTouch=(touch:AttributionTouch)=>!['direct','unknown'].includes(touch.source);
export function applyVisitorTouch(current:VisitorAttribution|null,touch:AttributionTouch):VisitorAttribution{
 if(!current)return {firstTouch:touch,lastTouch:touch,lastNonDirectTouch:isNonDirectTouch(touch)?touch:null};
 return {firstTouch:at(touch)<at(current.firstTouch)?touch:current.firstTouch,lastTouch:at(touch)>=at(current.lastTouch)?touch:current.lastTouch,lastNonDirectTouch:isNonDirectTouch(touch)&&(!current.lastNonDirectTouch||at(touch)>=at(current.lastNonDirectTouch))?touch:current.lastNonDirectTouch};
}
export function touchForAttributionModel(value:{first_touch?:AttributionTouch|null;last_touch?:AttributionTouch|null;last_non_direct_touch?:AttributionTouch|null}|null|undefined,model:AttributionModel){return model==='first_touch'?value?.first_touch??null:model==='last_non_direct'?value?.last_non_direct_touch??null:value?.last_touch??null;}
export function eligibleAttributionTouch(touch:AttributionTouch|null|undefined,now:Date=new Date(),lookbackDays=30){const age=now.getTime()-Date.parse(touch?.occurred_at??'');return touch&&Number.isFinite(age)&&age>=0&&age<=Math.max(1,lookbackDays)*86_400_000?touch:null;}
