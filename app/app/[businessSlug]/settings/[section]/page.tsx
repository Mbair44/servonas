import {notFound} from "next/navigation";
import type {SettingsSection} from "@/lib/settingsSections";
import {SettingsContent} from "../SettingsContent";
const sections=new Set<SettingsSection>(["operations","billing","communications","employees","pool-service"]);
export default async function SettingsSectionPage({params,searchParams}:{params:Promise<{businessSlug:string;section:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug,section}=await params;if(!sections.has(section as SettingsSection))notFound();
 return SettingsContent({businessSlug,q:await searchParams,section:section as SettingsSection});
}
