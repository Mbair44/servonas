export function customerImportFailureMessage(code:string|null|undefined){
 switch(code){
  case"23505":return"An existing customer or contact already uses this email or external ID. Return to duplicate review and choose whether to link, update, or create a separate record.";
  case"23503":return"A linked customer, service, location, or duplicate decision is no longer available. Refresh the import and review its links.";
  case"23502":return"A required database value is missing. Review the customer name and the complete service address.";
  case"23514":return"One of the imported values violates a database rule. Review the customer status, address, recurrence, and selected service.";
  case"42501":return"Servonas did not have permission to create this record. Confirm your workspace role and active access.";
  case"42P01":case"42703":case"42883":return"The customer-import database setup is incomplete. Apply every Epic 2.3 migration in timestamp order, then retry.";
  case"22007":case"22008":return"A date could not be understood. Use YYYY-MM-DD for next-service dates.";
  case"22023":return"An imported value has an unsupported format. Review the address, status, service frequency, and dates.";
  case"P0002":return"A referenced import record could not be found. Refresh this import before retrying.";
  default:return code?`The database rejected this customer (error ${code}). No partial customer record was kept. Contact Servonas support with this code.`:"The database did not return a diagnostic code. Retry once, then review the server log for this import ID.";
 }
}
