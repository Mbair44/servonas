export function normalizeTestSmsDestination(value: string) {
 const digits = value.replace(/\D/g, "");
 const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
 return national.length === 10 && /^[2-9]\d{9}$/.test(national) ? `+1${national}` : "";
}

export function formatTestSmsDestination(value: string) {
 const normalized = normalizeTestSmsDestination(value);
 if (!normalized) return value;
 const digits = normalized.slice(2);
 return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
