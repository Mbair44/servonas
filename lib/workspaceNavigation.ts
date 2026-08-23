export type WorkspaceNavigationItem={
 id:string;
 label:string;
 href?:string;
 icon?:string;
 children?:WorkspaceNavigationItem[];
 disabled?:boolean;
 badge?:string;
 visible?:boolean;
 routePatterns?:string[];
 exact?:boolean;
};

export const SIDEBAR_GROUPS_STORAGE_KEY="servonas.sidebar.groups.v1";

export function workspaceNavigation(slug:string,options:{poolService?:boolean;partyRental?:boolean}={}):WorkspaceNavigationItem[]{
 const base=`/app/${slug}`;
 return [
  {id:"dashboard",label:"Dashboard",href:base,routePatterns:[base],exact:true},
  {id:"customers",label:"Customers",children:[
   {id:"customer-list",label:"Customers",href:`${base}/customers`},
   {id:"customer-campaigns",label:"Campaigns",href:`${base}/customers/campaigns`},
  ]},
  {id:"operations",label:"Operations",children:[
   {id:"schedule",label:"Schedule",href:`${base}/schedule`},
   {id:"dispatch",label:"Dispatch",href:`${base}/dispatch`},
   {id:"jobs",label:"Jobs",href:`${base}/jobs`},
   {id:"services",label:"Services & Pricing",href:`${base}/price-book`},
   {id:"invoices",label:"Invoices",href:`${base}/invoices`},
  ]},
  {id:"sales",label:"Sales",children:[
   {id:"estimates",label:"Estimates",href:`${base}/estimates`},
   {id:"online-booking",label:"Online Booking",href:`${base}/booking`},
  ]},
  {id:"marketing",label:"Marketing",icon:"chart",children:[
   {id:"funnel",label:"Funnel",href:`${base}/marketing/funnel`},
   {id:"discounts",label:"Discounts",href:`${base}/marketing/discounts`},
   {id:"google-ads",label:"Google Ads",href:`${base}/marketing/google-ads`},
  ]},
  {id:"workforce",label:"Workforce",children:[
   {id:"team",label:"Team",href:`${base}/team`},
   {id:"field-app",label:"Field App",href:"/tech",routePatterns:["/tech"]},
  ]},
  {id:"planning",label:"Planning",children:[
   {id:"territories",label:"Territories",href:`${base}/territories`},
  ]},
  {id:"assets",label:"Assets",children:[
   {id:"equipment",label:"Equipment & Fleet",href:`${base}/equipment`},
   {id:"inventory",label:"Rental Inventory",href:`${base}/rental-inventory`,visible:options.partyRental===true},
  ]},
  {id:"settings",label:"Settings",children:[
   {id:"settings-general",label:"General",href:`${base}/settings`,exact:true},
   {id:"settings-website",label:"Website",href:`${base}/settings/website`},
   {id:"settings-operations",label:"Operations",href:`${base}/settings/operations`},
   {id:"settings-billing",label:"Billing",href:`${base}/settings/billing`},
   {id:"settings-communications",label:"Communications",href:`${base}/settings/communications`},
   {id:"settings-employees",label:"Employees",href:`${base}/settings/employees`},
   {id:"settings-pool-service",label:"Pool Service",href:`${base}/settings/pool-service`,visible:options.poolService===true},
  ]},
 ];
}

export function visibleNavigation(items:WorkspaceNavigationItem[]):WorkspaceNavigationItem[]{
 return items.flatMap(item=>{
  if(item.visible===false)return [];
  if(!item.children)return [item];
  const children=visibleNavigation(item.children);
  return children.length?[{...item,children}]:[];
 });
}

export function routeIsActive(pathname:string,item:WorkspaceNavigationItem){
 const patterns=item.routePatterns??(item.href?[item.href]:[]);
 return patterns.some(pattern=>pathname===pattern||(!item.exact&&
  pattern!=="/"&&pathname.startsWith(`${pattern}/`)
 ));
}

export function activeNavigationGroup(pathname:string,items:WorkspaceNavigationItem[]){
 return items.find(item=>item.children?.some(child=>routeIsActive(pathname,child)))?.id;
}

export function parseExpandedGroups(value:string|null,validGroupIds:string[]){
 if(!value)return [];
 try{
  const parsed:unknown=JSON.parse(value);
  if(!Array.isArray(parsed))return [];
  const valid=new Set(validGroupIds);
  return [...new Set(parsed.filter((item):item is string=>typeof item==="string"&&valid.has(item)))];
 }catch{return [];}
}
