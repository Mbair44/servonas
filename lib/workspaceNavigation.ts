export type WorkspaceNavigationItem={
 id:string;
 label:string;
 href?:string;
 children?:WorkspaceNavigationItem[];
 disabled?:boolean;
 badge?:string;
 visible?:boolean;
 routePatterns?:string[];
 exact?:boolean;
};

export const SIDEBAR_GROUPS_STORAGE_KEY="servonas.sidebar.groups.v1";

export function workspaceNavigation(slug:string):WorkspaceNavigationItem[]{
 const base=`/app/${slug}`;
 return [
  {id:"dashboard",label:"Dashboard",href:base,routePatterns:[base],exact:true},
  {id:"customers",label:"Customers",children:[
   {id:"customer-list",label:"Customers",href:`${base}/customers`},
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
  {id:"workforce",label:"Workforce",children:[
   {id:"team",label:"Team",href:`${base}/team`},
   {id:"field-app",label:"Field App",href:"/tech",routePatterns:["/tech"]},
  ]},
  {id:"planning",label:"Planning",children:[
   {id:"territories",label:"Territories",href:`${base}/territories`},
  ]},
  {id:"assets",label:"Assets",children:[
   {id:"inventory",label:"Inventory",disabled:true,badge:"Soon"},
  ]},
  {id:"settings",label:"Settings",href:`${base}/settings`},
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
