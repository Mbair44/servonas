export type TerritoryDecisionMetadata={
 source:"human"|"business_rules"|"optimization"|"ai";sourceVersion:string;recommendationKey:string;
 scenarioVersion:number;simulationRevision:number;score:number|null;
 categoryScores:Record<string,{weight:number;score:number|null}>;inputSnapshot:Record<string,unknown>;
 explanation:{summary:string[];reasons:string[]};outcome:"pending"|"accepted"|"modified"|"rejected"|"expired";
};
export function validateTerritoryDecisionMetadata(value:TerritoryDecisionMetadata){
 if(!value.sourceVersion.trim()||!value.recommendationKey.trim())return "Decision source and recommendation are required.";
 if(!Number.isSafeInteger(value.scenarioVersion)||value.scenarioVersion<1||!Number.isSafeInteger(value.simulationRevision)||value.simulationRevision<0)return "Decision revisions are invalid.";
 if(value.score!==null&&(!Number.isFinite(value.score)||value.score<0||value.score>100))return "Decision score must be between 0 and 100.";
 return null;
}
