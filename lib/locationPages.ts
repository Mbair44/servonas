import {createHash} from "node:crypto";

export type LocationPageSection={heading:string;body:string};
export type LocationPageFaq={question:string;answer:string};
export type GeneratedLocationPage={slug:string;pageTitle:string;metaDescription:string;ogTitle:string;ogDescription:string;h1:string;heroCopy:string;ctaLabel:string;sections:LocationPageSection[];faqs:LocationPageFaq[]};
export type LocationPageSource={business:{name:string;industry:string|null;description:string|null;phone:string|null;email:string|null;city:string|null;state:string|null};location:{name:string;city:string;state:string|null;jobCount90d:number;customerCount:number;reviewCount:number};website:{baseUrl:string;heroHeading:string|null;heroSubheading:string|null;aboutText:string|null;bookingEnabled:boolean;requestEnabled:boolean};serviceAreas:string[];services:Array<{name:string;description:string|null}>;inventory:Array<{name:string;description:string|null;category:string|null}>;hours:Array<{weekday:number;startTime:string;endTime:string}>;reviews:Array<{author:string;text:string;rating:number}>;policies:string[];};

const clean=(value:unknown,max=1000)=>typeof value==="string"?value.trim().replace(/\s+/g," ").slice(0,max):"";
const safeProviderError=(value:unknown)=>typeof value==="string"?value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email]").replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,"[id]").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").slice(0,300):null;
export const locationPageSlug=(city:string,state:string|null,primaryService:string)=>[city,state,primaryService].filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
export const locationSourceVersion=(source:LocationPageSource)=>createHash("sha256").update(JSON.stringify(source)).digest("hex");
const words=(value:string)=>new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(word=>word.length>3));
export function locationPageSimilarity(left:string,right:string){const a=words(left),b=words(right);if(!a.size||!b.size)return 0;let shared=0;for(const word of a)if(b.has(word))shared+=1;return shared/(a.size+b.size-shared);}
export const locationPageText=(page:Pick<GeneratedLocationPage,"h1"|"heroCopy"|"sections"|"faqs">)=>[page.h1,page.heroCopy,...page.sections.flatMap(section=>[section.heading,section.body]),...page.faqs.flatMap(faq=>[faq.question,faq.answer])].join(" ");

function normalizeGenerated(value:unknown,source:LocationPageSource):GeneratedLocationPage{
 const row=value&&typeof value==="object"?value as Record<string,unknown>:{};
 const sections=Array.isArray(row.sections)?row.sections.map(item=>{const part=item&&typeof item==="object"?item as Record<string,unknown>:{};return{heading:clean(part.heading,100),body:clean(part.body,1400)};}).filter(item=>item.heading&&item.body).slice(0,6):[];
 const faqs=Array.isArray(row.faqs)?row.faqs.map(item=>{const part=item&&typeof item==="object"?item as Record<string,unknown>:{};return{question:clean(part.question,160),answer:clean(part.answer,700)};}).filter(item=>item.question&&item.answer).slice(0,6):[];
 if(sections.length<4||faqs.length<4)throw new Error("Servonas could not generate a complete location page. Please try again.");
 const primaryService=source.services[0]?.name||source.inventory[0]?.category||source.inventory[0]?.name||source.business.industry?.replaceAll("_"," ")||"Local Services";
 const pageTitle=clean(row.pageTitle,65)||`${primaryService} in ${source.location.name} | ${source.business.name}`,metaDescription=clean(row.metaDescription,160)||`${source.business.name} serves ${source.location.name} with ${primaryService.toLowerCase()}. View available services and get started.`;
 return{
  slug:locationPageSlug(source.location.city,source.location.state,primaryService),
  pageTitle,metaDescription,
  ogTitle:clean(row.ogTitle,80)||pageTitle,
  ogDescription:clean(row.ogDescription,200)||metaDescription,
  h1:clean(row.h1,120)||`${primaryService} in ${source.location.name}`,heroCopy:clean(row.heroCopy,500)||`${source.business.name} serves customers in ${source.location.name}. Explore the services currently available and choose the next step that works for you.`,ctaLabel:clean(row.ctaLabel,40)||(source.website.bookingEnabled?"Check Availability":"Contact Us"),sections,faqs,
 };
}

export async function generateLocationPage(input:{source:LocationPageSource;existingPages:Array<{city:string;h1:string;hero_copy:string;sections:LocationPageSection[];faqs:LocationPageFaq[]}>;telemetry?:{operationId:string;businessSlug:string;actionName:string}}){
 const apiKey=process.env.OPENAI_API_KEY?.trim();
 if(!apiKey)throw new Error("AI page generation is not configured.");
 const existing=input.existingPages.map(page=>({city:page.city,summary:locationPageText({h1:page.h1,heroCopy:page.hero_copy,sections:page.sections??[],faqs:page.faqs??[]}).slice(0,1800)}));
 let highestSimilarity=0;
 for(let attempt=1;attempt<=2;attempt++){
  const startedAt=Date.now();
  if(input.telemetry)console.info("local_seo_downstream_started",{...input.telemetry,operationName:"openai_location_page_generation",endpoint:"https://api.openai.com/v1/chat/completions",method:"POST",attempt,fatal:true});
  const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_ASSISTANT_MODEL?.trim()||"gpt-4.1-mini",temperature:.55,response_format:{type:"json_schema",json_schema:{name:"servonas_location_page",strict:true,schema:{type:"object",additionalProperties:false,properties:{pageTitle:{type:"string"},metaDescription:{type:"string"},ogTitle:{type:"string"},ogDescription:{type:"string"},h1:{type:"string"},heroCopy:{type:"string"},ctaLabel:{type:"string"},sections:{type:"array",minItems:4,maxItems:6,items:{type:"object",additionalProperties:false,properties:{heading:{type:"string"},body:{type:"string"}},required:["heading","body"]}},faqs:{type:"array",minItems:4,maxItems:6,items:{type:"object",additionalProperties:false,properties:{question:{type:"string"},answer:{type:"string"}},required:["question","answer"]}}},required:["pageTitle","metaDescription","ogTitle","ogDescription","h1","heroCopy","ctaLabel","sections","faqs"]}}},messages:[{role:"system",content:"Create a useful customer-first city service page from verified tenant facts only. Never invent prices, guarantees, rankings, addresses, permits, licensing, insurance, certifications, years in business, availability, or local landmarks. Do not claim best, #1, or most trusted. Write naturally, not as a doorway page. Include meaningful city-specific service emphasis and use cases based only on the supplied activity and service-area evidence. Return only the requested JSON."},{role:"user",content:JSON.stringify({verifiedTenantData:input.source,existingLocationPages:existing,revisionInstruction:attempt===2?"The first draft was too similar to another city page. Rewrite the introduction, emphasis, section organization, use cases, and FAQs while staying within verified facts.":null})}]})});
  const body=await response.json().catch(()=>null) as any;
  if(!response.ok){console.error("local_seo_downstream_failed",{...(input.telemetry??{}),operationName:"openai_location_page_generation",endpoint:"https://api.openai.com/v1/chat/completions",method:"POST",httpStatus:response.status,durationMs:Date.now()-startedAt,errorType:body?.error?.type??null,errorCode:body?.error?.code??null,sanitizedError:safeProviderError(body?.error?.message),fatal:true});throw new Error("Servonas could not generate the location page right now. Please try again.");}
  if(input.telemetry)console.info("local_seo_downstream_completed",{...input.telemetry,operationName:"openai_location_page_generation",endpoint:"https://api.openai.com/v1/chat/completions",method:"POST",httpStatus:response.status,durationMs:Date.now()-startedAt,attempt,fatal:true,contentReturned:typeof body?.choices?.[0]?.message?.content==="string"});
  const content=body?.choices?.[0]?.message?.content;
  if(typeof content!=="string")throw new Error("AI location-page generation returned no content.");
  let parsed:unknown;try{parsed=JSON.parse(content);}catch{throw new Error("Servonas received an incomplete page draft. Please try again.");}
  const generated=normalizeGenerated(parsed,input.source),text=locationPageText(generated);
  highestSimilarity=input.existingPages.reduce((max,page)=>Math.max(max,locationPageSimilarity(text,locationPageText({h1:page.h1,heroCopy:page.hero_copy,sections:page.sections??[],faqs:page.faqs??[]}))),0);
  if(highestSimilarity<.72)return{page:generated,similarityScore:highestSimilarity};
 }
 throw new Error("The generated page was too similar to an existing location page. Please regenerate it.");
}
