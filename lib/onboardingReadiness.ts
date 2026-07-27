export type ReadinessFacts={company:boolean;businessProfile:boolean;businessHours:boolean;firstService:boolean;pilotAccess:boolean};
export function calculateReadiness(facts:ReadinessFacts){
 const required=[{key:"company",label:"Company information",complete:facts.company},{key:"businessProfile",label:"Business profile",complete:facts.businessProfile},
  {key:"businessHours",label:"Business hours",complete:facts.businessHours},{key:"firstService",label:"First service",complete:facts.firstService},
  {key:"pilotAccess",label:"Pilot Access Active",complete:facts.pilotAccess}];
 return {required,ready:required.every(item=>item.complete),percentage:Math.round(required.filter(item=>item.complete).length/required.length*100),
  recommended:[{key:"employees",label:"Import Employees",blocking:false},{key:"customers",label:"Import Customers",blocking:false}]};
}
