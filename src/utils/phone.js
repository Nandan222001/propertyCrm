/** Indian mobile numbers, validated exactly as the server does (so a form never accepts what the API refuses). */
export const normaliseMobile = (value) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
};
/** Keeps what is typed or pasted to at most 10 digits (drops spaces, letters and a leading +91 / 0). */
export const limitMobile = (value) => {
  const raw = String(value || '');
  const digits = raw.replace(/\D/g, '');
  const trimmed = digits.length > 10 ? normaliseMobile(digits) : digits;
  return trimmed.slice(0, 10);
};
/** Spread on a mobile <input>: browser-level 10-digit cap plus numeric keypad. */
export const MOBILE_INPUT = { inputMode: 'numeric', maxLength: 10, pattern: '[0-9]{10}', autoComplete: 'tel-national' };
export const isValidMobile = (value) => /^[6-9]\d{9}$/.test(normaliseMobile(value));
export const MOBILE_HINT = 'Enter a 10-digit mobile number that starts with 6, 7, 8 or 9.';
