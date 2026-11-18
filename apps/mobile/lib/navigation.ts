import type { Workspace } from "@servonas/shared";
import type { Experience } from "./preferences";
export function allowedExperiences(workspace:Workspace):Experience[]{const values:Experience[]=[];if(workspace.availableCapabilities.includes("operational_dashboard"))values.push("office");if(workspace.technicianEligible)values.push("technician");return values;}
export function selectedWorkspace(workspaces:Workspace[],saved:string|null){return workspaces.find(item=>item.id===saved)??workspaces[0]??null;}
export function selectedExperience(workspace:Workspace,saved:string|null):Experience|null{const values=allowedExperiences(workspace);return values.includes(saved as Experience)?saved as Experience:values[0]??null;}
