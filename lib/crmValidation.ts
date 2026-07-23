export const isValidCrmEmail = (value: string) =>
  !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const crmPhoneDigits = (value: string) => value.replace(/\D/g, "");
const comparablePhone = (value: string) => {
  const digits = crmPhoneDigits(value);
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};

export const isValidCrmPhone = (value: string) =>
  !value || crmPhoneDigits(value).length >= 10;

export function isPotentialCustomerDuplicate(
  candidate: { email?: string | null; phone?: string | null },
  email: string,
  phone: string,
) {
  const digits = comparablePhone(phone);
  return Boolean(
    (email && candidate.email?.toLowerCase() === email.toLowerCase()) ||
    (digits && comparablePhone(candidate.phone ?? "") === digits),
  );
}
