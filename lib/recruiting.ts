export const jobPostingStatuses=["draft","published","closed"] as const;
export type JobPostingStatus=(typeof jobPostingStatuses)[number];

export const jobApplicationStatuses=["new","under_review","interview","offer_extended","hired","rejected","withdrawn"] as const;
export type JobApplicationStatus=(typeof jobApplicationStatuses)[number];

export const employmentTypes=["full_time","part_time","seasonal","temporary","contract","other"] as const;
export type EmploymentType=(typeof employmentTypes)[number];

export const resumeMimeTypes=["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;
export type ResumeMimeType=(typeof resumeMimeTypes)[number];
export const maxResumeBytes=5*1024*1024;
export const defaultApplicantRetentionDays=365;
export const defaultRecruitingPrivacyNoticeVersion="recruiting-privacy-v1";

export type RecruitingSettings={
 businessId:string;
 careersEnabled:boolean;
 showCareersNavLink:boolean;
 showCareersFooterLink:boolean;
 notificationEmail:string|null;
 applicantRetentionDays:number;
 privacyNoticeVersion:string;
};

export const defaultRecruitingSettings=(businessId:string):RecruitingSettings=>({
 businessId,
 careersEnabled:false,
 showCareersNavLink:false,
 showCareersFooterLink:false,
 notificationEmail:null,
 applicantRetentionDays:defaultApplicantRetentionDays,
 privacyNoticeVersion:defaultRecruitingPrivacyNoticeVersion,
});

export const isJobPostingStatus=(value:unknown):value is JobPostingStatus=>typeof value==="string"&&(jobPostingStatuses as readonly string[]).includes(value);
export const isJobApplicationStatus=(value:unknown):value is JobApplicationStatus=>typeof value==="string"&&(jobApplicationStatuses as readonly string[]).includes(value);
export const isEmploymentType=(value:unknown):value is EmploymentType=>typeof value==="string"&&(employmentTypes as readonly string[]).includes(value);
export const isResumeMimeType=(value:unknown):value is ResumeMimeType=>typeof value==="string"&&(resumeMimeTypes as readonly string[]).includes(value);

export function normalizeJobSlug(value:string){
 return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120);
}

export function validateResumeMetadata(input:{name:unknown;type:unknown;size:unknown}){
 const name=typeof input.name==="string"?input.name.trim():"";
 const size=typeof input.size==="number"?input.size:Number(input.size);
 if(!name||name.length>255)return "Choose a résumé file with a valid filename.";
 if(!isResumeMimeType(input.type))return "Résumés must be PDF, DOC, or DOCX files.";
 if(!Number.isSafeInteger(size)||size<1||size>maxResumeBytes)return "Résumés must be 5 MB or smaller.";
 return null;
}
