type Business={name:string;phone?:string|null;email?:string|null};
const json=(value:unknown)=>JSON.stringify(value).replace(/</g,"\\u003c");

export function TenantHomepageSchema({business,url}:{business:Business;url:string}){
 const graph=[{"@context":"https://schema.org","@type":"LocalBusiness",name:business.name,url,telephone:business.phone??undefined,email:business.email??undefined},{"@context":"https://schema.org","@type":"WebSite",name:business.name,url}];
 return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:json({"@context":"https://schema.org","@graph":graph.map(({["@context"]:_,...entry})=>entry)})}}/>;
}

export function TenantLandingSchema({type,name,url,homeUrl}:{type:"CollectionPage"|"WebPage";name:string;url:string;homeUrl:string}){
 return <script id="tenant-landing-schema" type="application/ld+json" dangerouslySetInnerHTML={{__html:json({"@context":"https://schema.org","@graph":[{"@type":type,name,url},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Home",item:homeUrl},{"@type":"ListItem",position:2,name,item:url}]}]})}}/>;
}
