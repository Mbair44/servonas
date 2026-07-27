export const employeeImportTransitions={
  uploaded:["mapping","failed","canceled"],
  mapping:["validating","failed","canceled"],
  validating:["needs_review","ready","failed","canceled"],
  needs_review:["validating","ready","failed","canceled"],
  ready:["importing","canceled"],
  importing:["completed","completed_with_errors","failed"],
  completed:["rolled_back"],
  completed_with_errors:["rolled_back"],
  failed:[],canceled:[],rolled_back:[],
} as const;
export type EmployeeImportStatus=keyof typeof employeeImportTransitions;
export function canTransitionEmployeeImport(from:EmployeeImportStatus,to:string){
  return (employeeImportTransitions[from] as readonly string[]).includes(to);
}
export function employeeImportStageLabel(stage:string){
  return ({upload:"Upload",mapping:"Match columns",validation:"Validate data",review:"Review data",roles:"Assign roles",commit:"Import",invite:"Invite team",results:"Results"} as Record<string,string>)[stage]??"Import";
}
