import {redirect} from "next/navigation";

export default async function LegacyWebsitePreviewPage({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params;
 redirect(`/app/${businessSlug}/settings/website/preview`);
}
