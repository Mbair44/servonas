import Link from "next/link";
export type SettingsSection="general"|"operations"|"billing"|"communications"|"employees"|"pool-service";
export function SettingsNavigation({slug,active,isPool}:{slug:string;active:SettingsSection;isPool:boolean}){
 const items:[SettingsSection,string,string][]=[["general","General",`/app/${slug}/settings`],["operations","Operations",`/app/${slug}/settings/operations`],["billing","Billing",`/app/${slug}/settings/billing`],["communications","Communications",`/app/${slug}/settings/communications`],["employees","Employees",`/app/${slug}/settings/employees`],...(isPool?[["pool-service","Pool Service",`/app/${slug}/settings/pool-service`] as [SettingsSection,string,string]]:[])];
 return <nav className="settings-subnav" aria-label="Settings sections">{items.map(([key,label,href])=><Link key={key} href={href} aria-current={active===key?"page":undefined}>{label}</Link>)}</nav>;
}
