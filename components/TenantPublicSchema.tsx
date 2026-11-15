import {tenantHomepageSchema,type PublicBusinessSchema} from "@/lib/publicTenantSchema";
export {tenantHomepageSchema,type PublicBusinessSchema} from "@/lib/publicTenantSchema";
const json=(value:unknown)=>JSON.stringify(value).replace(/</g,"\\u003c");

export function TenantHomepageSchema({business,url}:{business:PublicBusinessSchema;url:string}){
 const graph=tenantHomepageSchema(business,url);
 return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:json(graph)}}/>;
}

export function TenantLandingSchema({type,name,url,homeUrl}:{type:"CollectionPage"|"WebPage";name:string;url:string;homeUrl:string}){
 return <script id="tenant-landing-schema" type="application/ld+json" dangerouslySetInnerHTML={{__html:json({"@context":"https://schema.org","@graph":[{"@type":type,name,url},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Home",item:homeUrl},{"@type":"ListItem",position:2,name,item:url}]}]})}}/>;
}
