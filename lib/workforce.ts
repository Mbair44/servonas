export const normalizeOptional = (value: unknown) => {
  const result = String(value ?? "").trim();
  return result || null;
};

export function validateEmployeeProfile(input: {
  preferredName: string; email: string | null; profilePhotoUrl: string | null;
  hireDate: string | null; terminationDate: string | null; isActive: boolean;
  firstName?:string|null;lastName?:string|null;employeeType?:string|null;employmentStatus?:string|null;
}) {
  if (!input.preferredName.trim() || input.preferredName.trim().length > 200) return "Preferred name is required and must be under 200 characters.";
  if(input.firstName!==undefined&&!input.firstName?.trim())return "First name is required.";
  if(input.lastName!==undefined&&!input.lastName?.trim())return "Last name is required.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return "Enter a valid employee email.";
  if(input.employeeType&&!["technician","dispatcher","office_staff","sales","manager","owner","other"].includes(input.employeeType))return "Choose a valid employee type.";
  if(input.employmentStatus&&!["active","inactive","leave","terminated"].includes(input.employmentStatus))return "Choose a valid employment status.";
  if (input.profilePhotoUrl && !/^https:\/\//i.test(input.profilePhotoUrl)) return "Profile photo must use a secure HTTPS URL.";
  if (input.hireDate && input.terminationDate && input.terminationDate < input.hireDate) return "Termination date cannot be before hire date.";
  if (input.terminationDate && input.isActive) return "An employee with a termination date must be inactive.";
  return null;
}
