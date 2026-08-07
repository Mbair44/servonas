export function normalizeInstagramUrl(value:string):string|null{
 const raw=value.trim();if(!raw)return null;
 const handle=raw.replace(/^@/,"");
 if(/^[A-Za-z0-9._]{1,30}$/.test(handle))return `https://www.instagram.com/${handle}/`;
 try{
  const url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);
  if(!["instagram.com","www.instagram.com"].includes(url.hostname.toLowerCase())||url.username||url.password)return null;
  const parts=url.pathname.split("/").filter(Boolean);
  if(parts.length!==1||!/^[A-Za-z0-9._]{1,30}$/.test(parts[0]))return null;
  return `https://www.instagram.com/${parts[0]}/`;
 }catch{return null;}
}
