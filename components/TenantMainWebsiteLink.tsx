export function TenantMainWebsiteLink({href,businessName}:{href:string;businessName:string}){
 return <nav className="tenant-main-website-link" aria-label="Main website"><a href={href}><span aria-hidden="true">←</span><span>Back to {businessName}&apos;s main website</span></a></nav>;
}
