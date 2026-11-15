export type PublicSeoServiceArea={city:string;state:string};

const stateNames=["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming","District of Columbia"] as const;
const stateByKey=new Map(stateNames.map(name=>[name.toLowerCase(),name]));
const stateAbbreviations=["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"] as const;
for(let index=0;index<stateAbbreviations.length;index++)stateByKey.set(stateAbbreviations[index].toLowerCase(),stateNames[index]);

const clean=(value:unknown,max:number)=>typeof value==="string"&&value.trim().length>0&&value.trim().length<=max?value.trim():null;
const validCity=(value:string)=>/^[A-Za-z](?:[A-Za-z .'-]*[A-Za-z.])?$/.test(value);

/** Returns only valid, de-duplicated US city/state pairs. Invalid stored data is ignored. */
export function normalizePublicSeoServiceAreas(value:unknown):PublicSeoServiceArea[]{
 if(!Array.isArray(value))return [];
 const seen=new Set<string>(),areas:PublicSeoServiceArea[]=[];
 for(const entry of value){
  if(!entry||typeof entry!=="object"||Array.isArray(entry))continue;
  const city=clean((entry as Record<string,unknown>).city,80),stateInput=clean((entry as Record<string,unknown>).state,40);
  const state=stateInput?stateByKey.get(stateInput.toLowerCase()):undefined;
  if(!city||!state||!validCity(city))continue;
  const key=`${city.toLowerCase()}|${state.toLowerCase()}`;
  if(!seen.has(key)){seen.add(key);areas.push({city,state});}
  if(areas.length===30)break;
 }
 return areas;
}

/** Parses the authenticated Website Settings textarea: one `City, State` per line. */
export function parsePublicSeoServiceAreas(value:unknown):{areas:PublicSeoServiceArea[];error:string|null}{
 const raw=typeof value==="string"?value.trim():"";
 if(!raw)return {areas:[],error:null};
 const entries=raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 if(entries.length>30)return {areas:[],error:"Add up to 30 public SEO service areas."};
 const candidate:unknown[]=[];
 for(const entry of entries){
  const parts=entry.split(",").map(part=>part.trim());
  if(parts.length!==2||!parts[0]||!parts[1])return {areas:[],error:"Use one City, State entry per line."};
  candidate.push({city:parts[0],state:parts[1]});
 }
 const areas=normalizePublicSeoServiceAreas(candidate);
 if(areas.length!==candidate.length)return {areas:[],error:"Each public SEO service area needs a valid US city and state."};
 return {areas,error:null};
}

export function publicSeoServiceAreasText(value:unknown){
 return normalizePublicSeoServiceAreas(value).map(area=>`${area.city}, ${area.state}`).join("\n");
}
