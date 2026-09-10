export type PaidRentalFulfillmentSteps={
 confirmBooking:()=>Promise<void>;
 confirmItems:()=>Promise<void>;
 ensureJob:()=>Promise<string>;
 saveFinalPaymentAuthorization:()=>Promise<void>;
};

export async function fulfillPaidRentalBooking(steps:PaidRentalFulfillmentSteps){
 await steps.confirmBooking();
 await steps.confirmItems();
 const jobId=await steps.ensureJob();
 await steps.saveFinalPaymentAuthorization();
 return jobId;
}
