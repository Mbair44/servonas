export type CustomerCandidate={id:string;displayName:string;phoneLast4?:string|null;email?:string|null};
export type CandidateSelection={kind:"none"}|{kind:"invalid_number";count:number}|{kind:"ambiguous";count:number}|{kind:"selected";candidate:CustomerCandidate};

const normalize=(value:string)=>value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const ordinal:Record<string,number>={one:1,first:1,two:2,second:2,three:3,third:3,four:4,fourth:4,five:5,fifth:5,six:6,sixth:6,seven:7,seventh:7,eight:8,eighth:8,nine:9,ninth:9,ten:10,tenth:10};

function requestedIndex(input:string){
 const value=normalize(input),numeric=value.match(/^(?:number )?(\d+)$/);if(numeric)return Number(numeric[1]);
 const spoken=value.match(/^(?:(?:go with|choose|pick|select) )?(?:the )?(?:number )?(one|first|two|second|three|third|four|fourth|five|fifth|six|sixth|seven|seventh|eight|eighth|nine|ninth|ten|tenth)(?: one| customer| record)?$/);return spoken?ordinal[spoken[1]]:null;
}

function identifyingPhrase(input:string){return normalize(input).replace(/^(?:go with|choose|pick|select) /,"").replace(/^the /,"").replace(/ (?:one|customer|record)$/," ").trim();}

export function resolveCustomerCandidateSelection(input:string,candidates:CustomerCandidate[]):CandidateSelection{
 if(!candidates.length)return{kind:"none"};const index=requestedIndex(input);if(index!==null)return index<1||index>candidates.length?{kind:"invalid_number",count:candidates.length}:{kind:"selected",candidate:candidates[index-1]};
 const phrase=identifyingPhrase(input);if(!phrase)return{kind:"none"};const digits=phrase.replace(/\D/g,"");
 const matches=candidates.filter(candidate=>{const name=normalize(candidate.displayName),email=normalize(candidate.email??"");return phrase.length>=2&&(name===phrase||name.includes(phrase)||phrase.includes(name)||email===phrase)||(digits.length>=4&&candidate.phoneLast4===digits.slice(-4));});
 return matches.length===1?{kind:"selected",candidate:matches[0]}:matches.length>1?{kind:"ambiguous",count:matches.length}:{kind:"none"};
}

export async function resolveCustomerCandidateAgainstTenant(input:string,candidates:CustomerCandidate[],findOwned:(id:string)=>Promise<{id:string;displayName:string}|null>){
 const selection=resolveCustomerCandidateSelection(input,candidates);if(selection.kind!=="selected")return selection;const owned=await findOwned(selection.candidate.id);return owned?{kind:"selected" as const,candidate:{...selection.candidate,id:owned.id,displayName:owned.displayName}}:{kind:"stale" as const};
}

export function selectCustomerConversationContext<T extends Record<string,unknown>>(context:T,customerId:string):T&{selectedCustomerId:string;pendingCustomerCandidates:CustomerCandidate[]}{return{...context,selectedCustomerId:customerId,pendingCustomerCandidates:[]};}
export function pendingCustomerConversationContext<T extends Record<string,unknown>>(context:T,candidates:CustomerCandidate[]):T&{pendingCustomerCandidates:CustomerCandidate[]}{return{...context,pendingCustomerCandidates:candidates};}
export function clearSelectedCustomerConversationContext<T extends Record<string,unknown>>(context:T){const next={...context};delete next.selectedCustomerId;delete next.pendingCustomerCandidates;return next;}
