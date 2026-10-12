/** Indian mobile numbers, validated exactly as the server does (so a form never accepts what the API refuses). */
export const normaliseMobile = (value) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
};
export const isValidMobile = (value) => /^[6-9]\d{9}$/.test(normaliseMobile(value));
export const MOBILE_HINT = 'Enter a valid 10-digit mobile number (it starts with 6, 7, 8 or 9).';
