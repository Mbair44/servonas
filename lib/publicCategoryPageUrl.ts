/**
 * Category website pages are tenant-root resources. Database slugs are created
 * with `slugify`, but normalizing here also keeps older `/slug` values safe.
 * This deliberately refuses URLs, query strings, fragments, and nested paths.
 */
export function tenantCategoryPageHref(slug:string|null|undefined){
 const normalized=String(slug??"").trim().replace(/^\/+|\/+$/g,"");
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(normalized))return null;
 return `/${normalized}`;
}
