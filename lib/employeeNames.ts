export type EmployeeNameRelation={preferred_name:string}|{preferred_name:string}[]|null|undefined;
export const relatedPreferredName=(value:EmployeeNameRelation,fallback="Team member")=>
 (Array.isArray(value)?value[0]?.preferred_name:value?.preferred_name)?.trim()||fallback;
