export const slugifyRental=(value:string)=>value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,72)||"rental";
export const publicRentalSlug=(item:{id:string;name:string})=>`${slugifyRental(item.name)}-${item.id.replace(/-/g,"").slice(0,10)}`;
export const matchesPublicRentalSlug=(item:{id:string;name:string},slug:string)=>publicRentalSlug(item)===slug.toLowerCase();
