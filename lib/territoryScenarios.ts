export const validateScenarioDetails=(name:string,description:string)=>{
 if(!name.trim()||name.trim().length>150)return "Enter a scenario name up to 150 characters.";
 if(description.length>2000)return "Scenario descriptions must be 2,000 characters or fewer.";
 return null;
};
export const summarizeScenario=(liveCount:number,items:Array<{change_type:string}>)=>({
 liveCount,
 proposedCount:items.filter(item=>item.change_type!=="removed").length,
 changedCount:items.filter(item=>item.change_type!=="unchanged").length,
});
