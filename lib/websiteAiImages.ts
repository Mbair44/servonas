import {getWebsiteFirstConfig} from "./websiteFirstConfig";
import type {EntitlementSummary} from "./entitlements/service";

export const websiteAiImageFeature="website_image_generation" as const;
export const websiteAiImageSizes=["1024x1024","1024x1536","1536x1024"] as const;
export const websiteAiImageQualities=["low","medium","high"] as const;
export const websiteAiImageTypes=["hero_banner","professional_at_work","service_being_performed","equipment_tools","before_after","custom_description"] as const;

export type WebsiteAiImageType=(typeof websiteAiImageTypes)[number];
export type WebsiteAiImageSize=(typeof websiteAiImageSizes)[number];
export type WebsiteAiImageQuality=(typeof websiteAiImageQualities)[number];
export type WebsiteAiImageGenerationKind="initial"|"regeneration";
export type WebsiteAiImageOutcome="generated"|"saved"|"discarded"|"replaced"|"failed";

type BusinessContext={
 businessId:string;
 businessName:string;
 industryProfile:string|null;
 websiteSource:string|null;
 city:string|null;
 state:string|null;
 serviceAreas:string[];
 services:string[];
 section:string;
 imageType:WebsiteAiImageType;
 customDescription:string|null;
};

const typeLabels:Record<WebsiteAiImageType,string>={
 hero_banner:"hero or banner image",
 professional_at_work:"professional at work",
 service_being_performed:"service being performed",
 equipment_tools:"equipment or tools",
 before_after:"before and after result",
 custom_description:"custom description",
};

const typeSceneGuidance:Record<WebsiteAiImageType,string>={
 hero_banner:"Compose for a polished website hero section with a clear focal point and room for interface copy without adding any text into the image.",
 professional_at_work:"Show a professional, trustworthy technician or crew member actively working in a believable service setting.",
 service_being_performed:"Show the core service in progress with realistic tools, posture, and safe technique.",
 equipment_tools:"Highlight clean, professional equipment or tools in context without turning the image into a catalog product shot.",
 before_after:"Create a tasteful split-scene or strongly contrasted result that communicates improvement without readable labels.",
 custom_description:"Follow the customer's requested scene while keeping it realistic and commercially appropriate.",
};

function labelIndustry(industryProfile:string|null,websiteSource:string|null){
 const config=getWebsiteFirstConfig(websiteSource);
 if(config)return config.industryLabel;
 return industryProfile?.replaceAll("_"," ").trim()||"local service business";
}

function locationLabel(city:string|null,state:string|null,serviceAreas:string[]){
 const primary=[city,state].filter(Boolean).join(", ");
 if(primary)return primary;
 return serviceAreas[0]||"its local service area";
}

export function buildWebsiteAiImagePrompt(input:BusinessContext){
 const industry=labelIndustry(input.industryProfile,input.websiteSource);
 const location=locationLabel(input.city,input.state,input.serviceAreas);
 const serviceSummary=input.services.length?input.services.slice(0,5).join(", "):"general service work";
 const custom=input.imageType==="custom_description"&&input.customDescription?`Customer direction: ${input.customDescription.trim()}.`:"";
 return [
  `Create a realistic professional website photograph for ${input.businessName}, a ${industry} business serving ${location}.`,
  `The image is for the ${input.section} section of the website and should depict a ${typeLabels[input.imageType]}.`,
  `Relevant services include ${serviceSummary}.`,
  typeSceneGuidance[input.imageType],
  custom,
  "Style: realistic commercial photography, natural lighting, approachable and trustworthy, polished but not overly staged.",
  "Safety and accuracy requirements: no logos, no fake company names, no phone numbers, no text overlays, no readable text on clothing, vehicles, tools, buildings, or signs, no watermarks, no malformed hands or equipment, no unsafe work practices, and do not imply brands, licenses, certifications, or services not provided.",
  "Keep the scene specific to the business industry and suitable for a professional small-business website.",
 ].filter(Boolean).join(" ");
}

export function websiteAiImageLimit(summary:Pick<EntitlementSummary,"entitlement"|"limits">|null|undefined){
 const override=summary?.limits?.[websiteAiImageFeature];
 if(typeof override==="number"&&Number.isFinite(override)&&override>=0)return override;
 const env=Number(process.env.SERVONAS_WEBSITE_AI_IMAGE_LIMIT_DEFAULT??"20");
 return Number.isFinite(env)&&env>0?env:20;
}

export function normalizeWebsiteAiImageSize(value:string|null|undefined):WebsiteAiImageSize{
 return websiteAiImageSizes.includes(value as WebsiteAiImageSize)?value as WebsiteAiImageSize:"1536x1024";
}

export function normalizeWebsiteAiImageQuality(value:string|null|undefined):WebsiteAiImageQuality{
 return websiteAiImageQualities.includes(value as WebsiteAiImageQuality)?value as WebsiteAiImageQuality:"medium";
}

export function estimateWebsiteAiImageCost(rate:number|null|undefined,imageCount:number){
 if(typeof rate!=="number"||!Number.isFinite(rate)||rate<0)return null;
 return Number((rate*Math.max(1,imageCount)).toFixed(8));
}
