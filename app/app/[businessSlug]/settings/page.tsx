import {SettingsContent} from "./SettingsContent";
export default async function Settings({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params;
 return <SettingsContent businessSlug={businessSlug} q={await searchParams} section="general"/>;
}
