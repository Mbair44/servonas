import type {ReactNode} from "react";
import {WebsiteFirstWorkspaceNav} from "@/components/WebsiteFirstWorkspaceNav";
import {requireWorkspace} from "@/lib/workspace";

export default async function WorkspaceLayout({children,params}:{children:ReactNode;params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params;
 const {supabase,business}=await requireWorkspace(businessSlug);
 const {data:onboarding}=await supabase.from("business_website_onboarding_states").select("current_step").eq("business_id",business.id).maybeSingle();
 const focused=Boolean(onboarding&&onboarding.current_step!=="completed");
 if(!focused)return children;
 return <div className="website-first-layout"><WebsiteFirstWorkspaceNav slug={businessSlug} name={business.name}/><div className="website-first-layout-content">{children}</div></div>;
}
