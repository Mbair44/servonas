type AssignmentError={code?:string;message?:string};
/** Show actionable causes without exposing raw database errors to the browser. */
export function jobAssignmentErrorMessage(error:AssignmentError){
 if(error.code==="PGRST202"||(error.code==="42883"&&error.message?.includes("set_job_technicians")))
  return "Multiple-technician assignment is not available in this database yet. Apply the 20260911000600_multi_technician_jobs.sql migration and reload the database API schema.";
 if(error.code==="42501")return "Your account does not have permission to update job assignments. Ask an owner or administrator to check your workspace access.";
 if(error.code==="23503"&&error.message?.includes("Technician is not assignable"))return "One of the selected technicians is no longer assignable. Check that their technician access is enabled, then reload the job.";
 if(error.code==="P0002")return "The job is no longer available. Reload the jobs list before trying again.";
 const code=error.code&&/^[A-Z0-9]{5,12}$/.test(error.code)?` (error ${error.code})`:"";
 return `Technician assignments could not be saved${code}. Reload the job and try again. If this continues, contact support with this error code.`;
}
