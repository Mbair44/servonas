import {redirect} from "next/navigation";

export default async function AssistantPage({params}:{params:Promise<{businessSlug:string}>}){const {businessSlug}=await params;redirect(`/app/${businessSlug}?assistant=open`);}
